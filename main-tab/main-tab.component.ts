import {
  Component,
  OnInit,
  OnDestroy,
  Output,
  EventEmitter,
  ViewContainerRef,
  ViewChild,
  TemplateRef,
  Input
} from '@angular/core';
import { FileInfo } from '@progress/kendo-angular-upload';
import { DialogCloseResult, DialogService } from '@progress/kendo-angular-dialog';
import { combineLatest, forkJoin, Subscription } from 'rxjs';

import { IErrorDict } from '../../interfaces';
import { ErrorService } from '../../services/error.service';
import { OrdersFormService } from '../../services/ordersForm.service';
import { FormTypes } from '../../static/consts';
import { Order } from '../../models/Order';
import { ActViewComponent, Order as BaseOrder, Project1C, Product } from 'shared-lib';

import {
  NgSpUser,
  UserInfo,
  OrderPeriod,
  ILookupObj,
  LossContract,
  Contract,
  IncomeContract,
  OrderStatuses,
  ContractClassifications
} from 'shared-lib';
import { RelateWindowComponent } from '../../../shared-order-lib/components/relate-window/relate-window.component';
import { FormControl, FormGroup, ValidationErrors, Validators } from '@angular/forms';
import { RelatedOrdersGridComponent } from '../../related-orders-grid/related-orders-grid.component';
import { RelatedCalculationGridComponent } from '../../../shared-order-lib/components/related-calculation-grid/related-calculation-grid.component';
import { debounceTime, filter, switchMap, tap } from 'rxjs/operators';

@Component({
  selector: 'or-lib-main-tab',
  templateUrl: './main-tab.component.html',
  styleUrls: ['./main-tab.component.scss']
})
export class MainTabComponent implements OnInit, OnDestroy {
  @Input() showSaveButton: boolean;
  @Input() showEditButton: boolean;
  @Input() showCancelButton: boolean;
  @Input() showResourceButton: boolean;
  @Input() showTopBtnGroup: boolean;
  @Input() showMoneyFields: boolean;
  @Output() save: EventEmitter<BaseOrder> = new EventEmitter<BaseOrder>();
  @Output() cancel: EventEmitter<null> = new EventEmitter<null>();

  @ViewChild('dialogContainer', { read: ViewContainerRef }) public dialogContainer: ViewContainerRef;
  @ViewChild('archiveDialogContainer', { read: ViewContainerRef }) public archiveDialogContainer: ViewContainerRef;
  @ViewChild('archiveDialogTemplate', { read: TemplateRef }) public archiveDialogTemplate: TemplateRef<any>;

  FormTypes = FormTypes;
  OrderStatuses = OrderStatuses;

  currentOrder: Order;
  contracts: Array<Contract | IncomeContract | LossContract>;
  hashtags: ILookupObj[];
  calculations: Product[];
  calculationsSource: Product[];
  fieldsErrors: IErrorDict = {};
  formIsValid: boolean;
  subscriptions: Subscription[] = [];
  saveInProgress: boolean;
  userInfo: UserInfo;
  formType: string;

  /** Договор связанный с текущим заказом */
  contractOfOrder: Contract | LossContract | IncomeContract;

  /** Расчетная выручка. Только если договор "Доходный". */
  calculatedIncome: number;

  ordersStatuses = Order.OrderStatuses.AllStatuses;
  ordersStatusStates = Order.OrderStatusStates.AllStatusStates;
  orderTypes = Order.OrderTypes.AllTypes;
  services: ILookupObj[];
  servicesLoading = true;
  showAddSelfHashtagBlock: boolean;
  selfHashtagText: string;
  saveHashtagInProgress: boolean;
  orderExpenseTypes: string[] = Order.OrderExpenseTypes.AllExpenseTypes;

  // /** Список связанных ПК для грида связанных ПК */
  // relatedCalculations: BehaviorSubject<CalculationWithContractType[]> = new BehaviorSubject<
  //   CalculationWithContractType[]
  // >([]);
  // /** Список связанных заказов для грида связанных заказов */
  // relatedOrders: BehaviorSubject<OrderWithContractType[]> = new BehaviorSubject<OrderWithContractType[]>([]);

  /** Первоначальное значение поля "Архивный" для заказа (до того как переключали его через switcher) */
  private initialStateOfArchive: boolean;

  /** Плэйсхолдер для нумерик-текстбокса "Расчетная выручка" */
  public placeholderCalculatedIncome = 'Загрузка...';

  /** Развернут или свернут список выбранных сервисов на форме просмотра. (изменяется при клике на стрелочку рядом с надписью выбрано сервисов) */
  public showServicesSelectedDetails = false;

  public form: FormGroup;
  /** Подписались ли мы на изменение значений в форм-контролах */
  private formControlsValueChangesSubbed = false;

  public ordersClassifications: string[] = Order.OrderClassifications.AllTypes;
  public currentRelateGridDialogRef: any;
  public oldStatus: string;
  private oldOrderPeriods: OrderPeriod[];

  currencyValue = '';
  public currencies = [
    { innerHtml: '&#8381;', value: Contract.ContractСurrencies.RUB },
    { innerHtml: '&#36;', value: Contract.ContractСurrencies.USD },
    { innerHtml: '&#8364;', value: Contract.ContractСurrencies.EUR }
  ];

  public uniqueCheckInProgress = false;
  public projects1c: Project1C[] = [];
  public calculationsForBudget: Product[];

  constructor(
    private ordersFormService: OrdersFormService,
    private errorService: ErrorService,
    private dialogService: DialogService
  ) {
    this.form = new FormGroup(
      {
        /** Инпут для создания нового хэштега */
        selfHashtagText: new FormControl(),
        /** Расчетная выручка. Этого котрола нет в модели заказа! */
        calculatedIncome: new FormControl({ value: null, disabled: true }),
        /** Активный ли заказ. Инвертированное значение поля "Архивный" */
        active: new FormControl(null, Validators.required),
        ChargeCode: new FormControl({ value: null, disabled: true }),
        Number: new FormControl(),
        Title: new FormControl(null, Validators.required),
        Transcript: new FormControl(),
        Contract: new FormControl(null, [
          (fc: FormControl): ValidationErrors | null => {
            const noTarrif = fc.value instanceof IncomeContract && !fc.value.Tariffs?.length ? true : false;
            return noTarrif
              ? { noTariff: { class: 'text-danger', value: 'У договора нет тариф(а/ов)! Внесите тарифы в договор.' } }
              : null;
          }
        ]),
        Income: new FormControl(),
        IncomeNDS: new FormControl(),
        ConfinementProbability: new FormControl(),
        Loss: new FormControl(),
        StartDate: new FormControl(),
        EndDate: new FormControl(),
        Type: new FormControl(),
        StatusState: new FormControl(),
        AllowTimeSheets: new FormControl(),
        SigningDate: new FormControl(),
        ProvisionServiceDatePlan: new FormControl(),
        HashtagsIds: new FormControl([]),
        Services: new FormControl([]),
        Status: new FormControl(),
        ExpenseType: new FormControl(),
        ProductID: new FormControl(),
        TariffChange: new FormControl(),
        Classification: new FormControl({ value: null, disabled: true }),
        FactSigningDate: new FormControl(),
        ProvisionServiceDateFact: new FormControl(),
        PlanSigningDate: new FormControl(),
        NumberByContract: new FormControl(),
        OrderPeriods: new FormControl([]),
        OrderProductEstimateBudgetID: new FormControl(),
        OrderProject1CEstimateBudget: new FormControl({ value: null, disabled: true }),
      },
      [
        (fg: FormGroup): ValidationErrors | null => {
          const multipleTariffs =
            fg.controls.Contract.value instanceof IncomeContract &&
            fg.controls.Classification.value === Order.OrderClassifications.Income &&
            fg.controls.Contract.value.Tariffs?.length > 1 &&
            fg.controls.OrderPeriods.errors?.noTariffs
              ? true
              : false;
          return multipleTariffs
            ? {
                multipleTariffs: {
                  class: 'text-warning',
                  value: 'У договора несколько тарифов! Выберите тариф для период(а/ов) вручную.'
                }
              }
            : null;
        },
        (fg: FormGroup): ValidationErrors | null => {
          const noPeriods =
            fg.controls.Classification.value === Order.OrderClassifications.Income &&
            !fg.controls.OrderPeriods.value?.length
              ? true
              : false;
          return noPeriods ? { noPeriods: { class: 'text-danger', value: 'Добавьте минимум 1 период!' } } : null;
        },
        (fg: FormGroup): ValidationErrors | null => {
          const noTariffs =
            fg.controls.Classification.value === Order.OrderClassifications.Income &&
            fg.controls.OrderPeriods.value?.some((v: OrderPeriod) => !v.TariffID)
              ? true
              : false;
          return noTariffs ? { noTariffs: { class: 'text-danger', value: 'У период(а/ов) должен быть тариф!' } } : null;
        },
        (fg: FormGroup): ValidationErrors | null => {
          const editMode =
            fg.controls.Classification.value === Order.OrderClassifications.Income &&
            fg.controls.OrderPeriods.value?.some(v => v.Mode === 'Edit')
              ? true
              : false;
          return editMode
            ? { editMode: { class: 'text-danger', value: 'Закончите редактирование период(а/ов)' } }
            : null;
        },
        (fg: FormGroup): ValidationErrors | null => {
          const productNoContract = this.contracts?.some(v => v.ProductID === fg.controls.ProductID.value)
            ? false
            : true;
          return productNoContract
            ? { productNoContract: { class: 'text-danger', value: 'У проектной калькуляции нет договора!' } }
            : null;
        }
      ]
    );
  }

  ngOnInit() {
    this.loadServices();
    const userSub = this.ordersFormService.userInfo$.subscribe(data => {
      if (!data) {
        return;
      }
      this.userInfo = data;
    });
    this.subscriptions.push(userSub);

    const sub = combineLatest([this.ordersFormService.dict$, this.ordersFormService.currentOrder$]).subscribe(data => {
      if (!data[0] || !data[1]) {
        return;
      }
      // Устанавливаем список выбора статусов заказа относительно типа заказа "Расходный"/"Доходный"
      this.ordersStatuses = data[1].isIncomeOrder
        ? OrderStatuses.AllStatuses.filter(
            s => !(s === OrderStatuses.ServicesRendered || s === OrderStatuses.CarriedOut)
          )
        : data[1].isLossOrder
        ? OrderStatuses.AllStatuses.filter(
            s =>
              !(
                s === OrderStatuses.AgreedDEFIR ||
                s === OrderStatuses.Concluded ||
                s === OrderStatuses.Rejected ||
                s === OrderStatuses.Terminated
              )
          )
        : OrderStatuses.AllStatuses;

      const filterContractsByOrderClassification = (
        order: Order,
        contracts: Array<Contract | IncomeContract | LossContract>
      ) => {
        if (order.Classification === Order.OrderClassifications.Income) {
          // Если заказ доходный то возвращаем только доходные договора
          return contracts.filter(c => c instanceof IncomeContract);
        } else if (order.Classification === Order.OrderClassifications.Loss) {
          // Если заказ расходный то возвращаем только расходные договора
          return contracts.filter(c => c instanceof LossContract);
        } else {
          // Если у заказа не проставлена классификация (он ни расходный ни доходный),
          // то возвращаем все договора и доходные и расходные и с неопределенным типом
          return contracts;
        }
      };
      this.contracts = filterContractsByOrderClassification(data[1], data[0].contracts);
      this.hashtags = data[0].hashtags;
      this.calculationsSource = data[0].calculations;
      this.calculations = data[0].calculations.filter(
        v => (!v.IsArchive && v.Status !== Product.ProductStatuses.Completed)
      );
      this.calculationsForBudget = this.calculations.filter(v => (v.Status === Product.ProductStatuses.PreSale ||
         v.Status === Product.ProductStatuses.Approved || v.Status === Product.ProductStatuses.ApprovedRT
        || v.Status === Product.ProductStatuses.Agreed || v.Status ===  Product.ProductStatuses.AgreedIK) && !v.IsArchive);
      this.projects1c = data[0].projects1c;
      this.currentOrder = data[1];

      if (typeof this.initialStateOfArchive !== 'boolean') {
        this.initialStateOfArchive = this.currentOrder.IsArchive;
      }
      this.oldStatus = this.currentOrder.Status;
      this.oldOrderPeriods = [...this.currentOrder.OrderPeriods];
      const controlNames = Object.getOwnPropertyNames(this.form.controls);
      controlNames.forEach(cn => {
        switch (cn) {
          case 'active': {
            this.form.controls.active.setValue(!this.currentOrder.IsArchive, { emitEvent: false });
            break;
          }
          // данных для этого поля нет в этой функции-обработчике
          case 'calculatedIncome': {
            break;
          }
          // это поле не надо инициализировать/заполнять (заполняется пользователем)
          case 'selfHashtagText': {
            break;
          }
          case 'IncomeNDS': {
            this.form.controls.IncomeNDS.setValue(
              this.currentOrder.Income ? this.currentOrder.Income * 1.2 : undefined,
              { emitEvent: false }
            );
            break;
          }
          case 'Contract': {
            const contractOfOrder = this.contracts.find(
              v => v.ID === this.currentOrder.ContractID && typeof v.ID === 'number'
            );
            this.form.controls[cn].setValue(contractOfOrder, { emitEvent: false });
            break;
          }
          case 'OrderProject1CEstimateBudget': {
            if (this.currentOrder.OrderProductEstimateBudgetID) {
              if (this.currentOrder.OrderProject1CEstimateBudgetID) {
                this.form.controls[cn].setValue(this.currentOrder.OrderProject1CEstimateBudgetValue);
              } else {
                this.form.controls[cn].setValue('Выбранная проектная калькуляция не сопоставлена с проектом 1С');
              }
            }
            break;
          }
          default: {
            this.form.controls[cn].setValue(this.currentOrder[cn], { emitEvent: false });
            break;
          }
        }
      });
      this.subOnFormControlsValueChanges();

      this.setFormState();

      // this.getOrderRelatedFields();
      this.getContractOfOrder(this.currentOrder, contract => {
        // получаем договор связанный с заказом
        const orderStatus = this.currentOrder.Status;
        // Если статус заказа = "Заключен" || "Согласован ДЭФИР" || "Согласован"
        // и если договор "Доходный"
        if (
          (orderStatus === Order.OrderStatuses.Concluded ||
            orderStatus === Order.OrderStatuses.AgreedDEFIR ||
            orderStatus === Order.OrderStatuses.Agreed) &&
          contract instanceof IncomeContract
        ) {
          this.getCalculatedIncome(this.currentOrder.ID); // получаем расчетную выручку
        }
      });
    });
    this.subscriptions.push(sub);

    const formTypeSub = this.ordersFormService.formType$.subscribe(data => {
      if (!data) {
        return;
      }
      this.formType = data;
      this.setFormState();
    });
    this.subscriptions.push(formTypeSub);
  }

  public orderPeriodsChange(op: OrderPeriod[]) {
    this.form.controls.OrderPeriods.setValue(op);
  }

  /** Подписываемся на изменение значений в форм-контролах на форме, если еще не подписаны */
  private subOnFormControlsValueChanges() {
    if (this.formControlsValueChangesSubbed) {
      return;
    }
    const controlNames = Object.getOwnPropertyNames(this.form.controls);
    controlNames.forEach(cn => {
      let sub: Subscription;
      switch (cn) {
        case 'active': {
          sub = this.form.controls.active.valueChanges.subscribe(val => {
            this.onActiveChange(val);
          });
          break;
        }
        // это поле только для чтения поэтому не подписываемся на его изменение
        case 'calculatedIncome': {
          break;
        }
        case 'selfHashtagText': {
          sub = this.form.controls[cn].valueChanges.subscribe(val => (this.selfHashtagText = val));
          break;
        }
        case 'Title': {
          sub = this.form.controls[cn].valueChanges
            .pipe(
              filter(() => !!this.currentOrder),
              tap(() => (this.currentOrder.Title = '')),
              filter((v: string) => v?.length > 0),
              tap(() => {
                this.uniqueCheckInProgress = true;
              }),
              debounceTime(1000),
              switchMap((v: string) => forkJoin([this.ordersFormService.isUniqueTitleOfOrder(v), Promise.resolve(v)]))
            )
            .subscribe(([isUnique, title]) => {
              this.uniqueCheckInProgress = false;
              if (isUnique) {
                // Если не устанавливать ошибку, через setErros то она автоматически стирается при изменении значения в этом поле ("Title")
                this.currentOrder.Title = title;
              } else {
                this.form.controls.Title.setErrors({ notUnique: true });
                this.currentOrder.Title = '';
              }
            });
          break;
        }
        case 'Services': {
          sub = this.form.controls[cn].valueChanges.subscribe((val: ILookupObj[]) => {
            this.currentOrder[cn] = val;
            this.currentOrder.ServicesIds = val.map(v => v.id);
          });
          break;
        }
        case 'Income': {
          sub = this.form.controls[cn].valueChanges.subscribe(val => {
            this.currentOrder[cn] = val;
            this.form.controls.IncomeNDS.setValue(val ? val * 1.2 : undefined, { emitEvent: false });
          });
          break;
        }
        case 'IncomeNDS': {
          sub = this.form.controls[cn].valueChanges.subscribe(val => {
            const Income = val ? (val * 10) / 12 : undefined;
            this.form.controls.Income.setValue(Income, { emitEvent: false });
            this.currentOrder.Income = Income;
          });
          break;
        }
        case 'Contract': {
          sub = this.form.controls[cn].valueChanges.subscribe((val: Contract | IncomeContract | LossContract) => {
            this.currentOrder.ContractID = val.ID;
            // Если меняем договор, то очищаем тарифы у периодов или если у договора ровно один тариф, то проставляем его
            this.form.controls.OrderPeriods.setValue(
              this.form.controls.OrderPeriods.value.map(v => {
                v.TariffID = val instanceof IncomeContract && val.Tariffs?.length === 1 ? val.Tariffs[0].id : null;
                v.TariffValue =
                  val instanceof IncomeContract && val.Tariffs?.length === 1 ? val.Tariffs[0].value : null;
                if (!v.TariffID && !v.TariffValue) {
                  // Если не проставили тариф (когда у договора нет тарифов или их несколько, то ставим периоды в режим редактирования)
                  v.Mode = 'Edit';
                }
                return v;
              })
            );
          });
          break;
        }
        case 'StartDate': {
          sub = this.form.controls[cn].valueChanges.subscribe(val => {
            this.currentOrder[cn] = val;
            // если тарифы не меняются то создаем новый и единственный период заказа
            if (!this.form.controls.TariffChange.value) {
              const tempOP = new OrderPeriod();
              Object.assign(tempOP, {
                StartDate: val,
                EndDate: this.form.controls.EndDate.value,
                OrderID: this.currentOrder.ID,
                OrderValue: this.currentOrder.Title,
                Percent: 0,
                TariffID:
                  this.form.controls.Contract.value instanceof IncomeContract &&
                  this.form.controls.Contract.value.Tariffs?.length === 1
                    ? this.form.controls.Contract.value.Tariffs[0].id
                    : null,
                TariffValue:
                  this.form.controls.Contract.value instanceof IncomeContract &&
                  this.form.controls.Contract.value.Tariffs?.length === 1
                    ? this.form.controls.Contract.value.Tariffs[0].value
                    : null
              } as OrderPeriod);
              this.form.controls.OrderPeriods.setValue([tempOP]);
            }
          });
          break;
        }
        case 'EndDate': {
          sub = this.form.controls[cn].valueChanges.subscribe(val => {
            this.currentOrder[cn] = val;
            // если тарифы не меняются то создаем новый и единственный период заказа
            if (!this.form.controls.TariffChange.value) {
              const tempOP = new OrderPeriod();
              Object.assign(tempOP, {
                StartDate: this.form.controls.StartDate.value,
                EndDate: val,
                OrderID: this.currentOrder.ID,
                OrderValue: this.currentOrder.Title,
                Percent: 0,
                TariffID:
                  this.form.controls.Contract.value instanceof IncomeContract &&
                  this.form.controls.Contract.value.Tariffs?.length === 1
                    ? this.form.controls.Contract.value.Tariffs[0].id
                    : null,
                TariffValue:
                  this.form.controls.Contract.value instanceof IncomeContract &&
                  this.form.controls.Contract.value.Tariffs?.length === 1
                    ? this.form.controls.Contract.value.Tariffs[0].value
                    : null
              } as OrderPeriod);
              this.form.controls.OrderPeriods.setValue([tempOP]);
            }
          });
          break;
        }
        case 'TariffChange': {
          sub = this.form.controls[cn].valueChanges.subscribe(val => {
            this.currentOrder[cn] = val;
            if (val) {
              this.form.controls.EndDate.disable({ emitEvent: false });
              this.form.controls.StartDate.disable({ emitEvent: false });
            } else {
              this.form.controls.EndDate.enable({ emitEvent: false });
              // Запускаем обработчик значение StartDate чтобы добавился один и единственный период
              this.form.controls.StartDate.enable({ emitEvent: true });
            }
          });
          break;
        }
        case 'OrderPeriods': {
          sub = this.form.controls[cn].valueChanges.subscribe((val: OrderPeriod[]) => {
            this.currentOrder[cn] = val;
            if (this.form.controls.TariffChange.value && val?.length) {
              let startDate = val[0].StartDate;
              let endDate = val[0].EndDate;
              val.forEach(v => {
                startDate = v.StartDate < startDate ? v.StartDate : startDate;
                endDate = v.EndDate > endDate ? v.EndDate : endDate;
              });
              this.form.controls.StartDate.setValue(startDate);
              this.form.controls.EndDate.setValue(endDate);
            }
          });
          break;
        }
        case 'Status': {
          sub = this.form.controls[cn].valueChanges.subscribe(val => {
            this.currentOrder[cn] = val;
            this.onStatusChange(val);
          });
          break;
        }
        case 'OrderProductEstimateBudgetID': {
          sub = this.form.controls[cn].valueChanges.subscribe(val => {
            this.currentOrder[cn] = val;
            if (val) {
              const product = this.calculationsForBudget.find(o => o.ID === val);
              const project1c = this.projects1c.find(o => o.ID === product.Project1cID);
              if (project1c) {
                this.form.controls.OrderProject1CEstimateBudget.setValue(project1c.TemplateTitle);
                this.currentOrder.OrderProject1CEstimateBudgetID = project1c.ID;
              } else {
                this.form.controls.OrderProject1CEstimateBudget.setValue('Выбранная проектная калькуляция не сопоставлена с проектом 1С');
                this.currentOrder.OrderProject1CEstimateBudgetID = null;
              }
            } else {
              this.form.controls.OrderProject1CEstimateBudget.setValue(null);
              this.currentOrder.OrderProject1CEstimateBudgetID = null;
            }
          });
          break;
        }
        default: {
          sub = this.form.controls[cn].valueChanges.subscribe(val => (this.currentOrder[cn] = val));
          break;
        }
      }
      if (sub) {
        this.subscriptions.push(sub);
      }
    });
    this.formControlsValueChangesSubbed = true;
  }
  loadServices() {
    this.ordersFormService
      .getServices()
      .then(
        data => (this.services = data),
        reason => alert(reason)
      )
      .finally(() => (this.servicesLoading = false));
  }
  // /** Загружает данные по связанным заказам и ПК для таблиц заказов и ПК */
  // private getOrderRelatedFields() {
  //   if (this.currentOrder.RelatedProductsIds && this.currentOrder.RelatedProductsIds.length) {
  //     this.ordersFormService.getCalculationsByIdsWithContractType(this.currentOrder.RelatedProductsIds).then(
  //       data => this.relatedCalculations.next(data),
  //       err => alert(err)
  //     );
  //   }
  //   if (this.currentOrder.RelatedOrdersIds && this.currentOrder.RelatedOrdersIds.length) {
  //     this.ordersFormService.getOrdersByIdsWithContractType(this.currentOrder.RelatedOrdersIds).then(
  //       data => this.relatedOrders.next(data),
  //       err => alert(err)
  //     );
  //   }
  // }
  /** Загружает договор связанный с переданным заказом */
  private getContractOfOrder(order: Order, callback?: (contract: Contract | IncomeContract | LossContract) => void) {
    if (!order.ContractID) {
      console.log('Заказ - ', order, 'Не связан ни с одним договором.');
      return;
    }
    this.ordersFormService.getContract(order.ContractID).then(
      contract => {
        this.contractOfOrder = contract;

        let contractCurrencyField = null;
        if (this.contractOfOrder) {
          // Если рамочный то 'MarginalCostVal', если обычный и расходный то 'LossVal', если обычный и доходный 'IncomeVal'
          // в остальных случаях null
          contractCurrencyField =
            this.contractOfOrder.Classification === ContractClassifications.Frame
              ? 'MarginalCostVal'
              : this.contractOfOrder.Classification === ContractClassifications.Usual
              ? this.contractOfOrder.isLossContract
                ? 'LossVal'
                : this.contractOfOrder.isIncomeContract
                ? 'IncomeVal'
                : null
              : null;
        }
        // Если вычислили contractCurrencyField и при обращении по этому полю в договоре получаем валюту, то оставляем ее
        // в противном случае проставляем валюту в рубли
        const contractCurrency =
          contractCurrencyField && this.contractOfOrder?.[contractCurrencyField]
            ? this.contractOfOrder?.[contractCurrencyField]
            : LossContract.ContractСurrencies.RUB;
        this.currencyValue = this.currencies.find(c => c.value === contractCurrency).innerHtml;
        if (callback) {
          callback(contract);
        }
      },
      err => {
        const msg = `Не удалось загрузить договор связанный с текущим заказом. ${err}`;
        console.log(msg);
        alert(msg);
      }
    );
  }
  /** Загружает расчетную выручку по переданному заказу */
  private getCalculatedIncome(orderId: number) {
    this.ordersFormService
      .getOrderCalculatedIncome(orderId)
      .then(
        income => {
          this.calculatedIncome = income;
          this.form.controls.calculatedIncome.setValue(income);
        },
        err => {
          const msg = `Не удалось загрузить расчетную выручку для текущего заказа. ${err}`;
          console.log(msg, this.currentOrder);
          alert(msg);
        }
      )
      .finally(() => (this.placeholderCalculatedIncome = ''));
  }
  async onSaveOrder() {
    if (this.saveInProgress || this.form.invalid) {
      return;
    }
    this.fieldsErrors = {};
    const validateResult = this.currentOrder.validateOrder();
    this.formIsValid = validateResult.isValid;
    if (!validateResult.isValid) {
      this.fieldsErrors = validateResult.errors;
      return;
    }
    if (this.currentOrder.IsArchive) {
      this.currentOrder.AllowTimeSheets = false;
    }
    let orderByContractIsValid = true;
    if (this.contractOfOrder && this.contractOfOrder.isFrameContract && this.currentOrder.NumberByContract) {
      orderByContractIsValid = await this.ordersFormService.checkOrderNumberByContractIsAvaiable(
        this.currentOrder.NumberByContract,
        this.currentOrder.ContractID,
        this.currentOrder.ID
      );
    }
    if (!orderByContractIsValid) {
      this.formIsValid = false;
      this.fieldsErrors['NumberByContract'] =
        'Данный номер заказа по договору уже используется. Пожалуйста, используйте другой номер.';
      return;
    }
    this.saveInProgress = true;
    this.ordersFormService
      .saveOrder(this.checkNeedUpdatePeriods())
      .then(async data => {
        if (!this.currentOrder.ID) {
          this.currentOrder.ID = data.ID;
        }
        if (this.currentOrder.Status === OrderStatuses.Rejected && this.oldStatus !== this.currentOrder.Status) {
          await this.ordersFormService.cancelOrderTasks(this.currentOrder.ID);
        }
        // this.ordersFormService.instance.currentOrder$.next(this.currentOrder);
        if (
          typeof this.currentOrder.IsArchive === 'boolean' &&
          this.currentOrder.IsArchive !== this.initialStateOfArchive
        ) {
          this.ordersFormService.archiveOrder(this.currentOrder.ID, this.currentOrder.IsArchive).then(
            response => {
              if (response.ResponseStatus != 'Ok') {
                const msg = this.currentOrder.IsArchive
                  ? 'Не удалось поместить заказ в "Архив"'
                  : 'Не удалось вернуть заказ из "Архива"';
                alert(msg);
                console.log(response);
              } else {
                this.save.emit(data);
                this.ordersFormService.formType$.next(FormTypes.View);
              }
            },
            reason => {
              const msg = this.currentOrder.IsArchive
                ? 'Не удалось поместить заказ в "Архив"'
                : 'Не удалось вернуть заказ из "Архива"';
              alert(msg);
              console.log(reason);
            }
          );
        } else {
          this.save.emit(data);
          this.ordersFormService.formType$.next(FormTypes.View);
        }
      })
      .catch(err => {
        this.errorService.setErrorText(err);
      })
      .finally(() => {
        this.saveInProgress = false;
      });
  }
  cancelAction() {
    this.cancel.emit();
    this.ordersFormService.formType$.next(FormTypes.View);
  }
  private checkNeedUpdatePeriods(): boolean {
    let result = false;
    /** Равны ли даты, без учета времени. */
    const datesIsEqual = (d1: Date, d2: Date) =>
      d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate()
        ? true
        : false;
    this.oldOrderPeriods.forEach(op => {
      const findedCurOp = this.currentOrder.OrderPeriods.find(
        curOp =>
          datesIsEqual(curOp.EndDate, op.EndDate) &&
          datesIsEqual(curOp.StartDate, op.StartDate) &&
          curOp.Percent === op.Percent &&
          curOp.TariffID === op.TariffID
      );
      if (!findedCurOp) {
        result = true;
      }
    });
    return result;
  }
  public onShowRelateWindow(mode: 'Order' | 'PC') {
    const dialog = this.dialogService.open({
      width: '50%',
      height: '70%',
      content: RelateWindowComponent,
      appendTo: this.dialogContainer
    });
    (dialog.content.instance as RelateWindowComponent).initMode = mode;
    (dialog.content.instance as RelateWindowComponent).orderClassification = this.currentOrder.Classification;
    (dialog.content.instance as RelateWindowComponent).orderId = this.currentOrder.ID;
    // (dialog.content.instance as RelateWindowComponent).getData(this.currentOrder.Classification);
    // (dialog.content.instance as RelateWindowComponent).selectedOrders = [...this.relatedOrders.getValue()];
    // (dialog.content.instance as RelateWindowComponent).selectedCalculations = [...this.relatedCalculations.getValue()];
    dialog.result.toPromise().then(() => {
      this.currentRelateGridDialogRef?.content?.instance?.onCloseRelateWindow();
      // if (data instanceof DialogCloseResult) {
      //   return;
      // } else {
      //   this.currentOrder.RelatedOrdersIds = (data as any).orders ? (data as any).orders.map(o => o.ID) : [];
      //   this.currentOrder.RelatedProductsIds = (data as any).calculations
      //     ? (data as any).calculations.map(c => c.ID)
      //     : [];
      //   this.relatedOrders.next((data as any).orders ? (data as any).orders : []);
      //   this.relatedCalculations.next((data as any).calculations ? (data as any).calculations : []);
      // }
    });
  }
  onChangedResponsibleUser(value: NgSpUser) {
    if (value) {
      this.currentOrder.ResponsibleUserID = value.ID;
      this.currentOrder.ResponsibleUserValue = value.DisplayName;
    } else {
      this.currentOrder.ResponsibleUserID = null;
      this.currentOrder.ResponsibleUserValue = null;
    }
  }
  saveSelfHashtag() {
    if (this.saveHashtagInProgress || !this.selfHashtagText) {
      return;
    }
    this.saveHashtagInProgress = true;
    this.ordersFormService
      .createNewHashtag(this.selfHashtagText)
      .then(data => {
        this.hashtags.push({
          id: data,
          value: this.selfHashtagText
        });
        this.currentOrder.HashtagsIds.push(data);
        this.form.controls.HashtagsIds.setValue(this.currentOrder.HashtagsIds);
        this.hideAddSelfHashtagBlock();
      })
      .catch(err => {
        this.errorService.setErrorText(err);
      })
      .finally(() => {
        this.saveHashtagInProgress = false;
      });
  }
  onShowAddSelfHashtagBlock() {
    this.showAddSelfHashtagBlock = true;
  }
  hideAddSelfHashtagBlock() {
    this.showAddSelfHashtagBlock = false;
    this.selfHashtagText = null;
  }
  /** Таг-маппер для мультиселекта сервисов.
   * Если выбрано меньше 3 айтемов, то их названия полностью пишутся иначе отображается шаблон с кол-вом выбранных эл-тов */
  public tagMapper(tags: any[]): any[] {
    return tags.length < 3 ? tags : [tags];
  }
  /** Обработчик при клике на кнопку из группы кнопок "Акты", "Заказы", "ПК".
   * При клике на кнопку должно появиться диалоговое окно со связанными заказами или ПК или окно с актами
   */
  public onBtnGrpClick(dialogType: 'Акты' | 'Заказы' | 'ПК') {
    // let dialogRef: DialogRef;
    switch (dialogType) {
      case 'Акты': {
        this.currentRelateGridDialogRef = this.openBtnGrpDialog(ActViewComponent);
        this.currentRelateGridDialogRef.content.instance.query = {
          ID: this.currentOrder.ID,
          Type: 'order',
          Period: { startDate: this.currentOrder.StartDate, endDate: this.currentOrder.EndDate }
        };
        break;
      }
      case 'Заказы': {
        this.currentRelateGridDialogRef = this.openBtnGrpDialog(RelatedOrdersGridComponent);
        this.currentRelateGridDialogRef.content.instance.order = this.currentOrder;
        // dialogRef.content.instance.orders = this.relatedOrders;
        this.currentRelateGridDialogRef.content.instance.gridHeight = '100%';
        // dialogRef.content.instance.showRelateWindowBtnDisabled =
        //   this.formType !== FormTypes.Edit || this.currentOrder.IsArchive ? true : false;
        const showRelateWindowSub = this.currentRelateGridDialogRef.content.instance.showRelateWindow.subscribe(() => {
          this.onShowRelateWindow('Order');
        });
        this.currentRelateGridDialogRef.result.toPromise().finally(() => showRelateWindowSub.unsubscribe());
        break;
      }
      case 'ПК': {
        this.currentRelateGridDialogRef = this.openBtnGrpDialog(RelatedCalculationGridComponent);
        // dialogRef.content.instance.calculations = this.relatedCalculations;
        this.currentRelateGridDialogRef.content.instance.order = this.currentOrder;
        this.currentRelateGridDialogRef.content.instance.gridHeight = '100%';
        // dialogRef.content.instance.showRelateWindowBtnDisabled =
        // this.formType !== FormTypes.Edit || this.currentOrder.IsArchive ? true : false;
        const showRelateWindowSub = this.currentRelateGridDialogRef.content.instance.showRelateWindow.subscribe(() => {
          this.onShowRelateWindow('PC');
        });
        this.currentRelateGridDialogRef.result.toPromise().finally(() => showRelateWindowSub.unsubscribe());
        break;
      }
      default: {
        // если каким-то образом не передался тип открываемого диалога, то контент диалога будет сообщать о непредвиденной ошибке
        this.openBtnGrpDialog(`Произошла непредвиденная ошибка`);
        break;
      }
    }
  }

  private openBtnGrpDialog(content: any) {
    return this.dialogService.open({
      content: content,
      appendTo: this.dialogContainer,
      height: '90%',
      width: '90%',
      actions: [{ text: 'Закрыть', primary: true }]
    });
  }

  // Обработчики изменения вложений компоненты form-attachments
  public onDeleteAttachment(fileInfo: FileInfo) {
    this.currentOrder.AttachmentFiles = this.currentOrder.AttachmentFiles.filter(value => {
      return value.name != fileInfo.name;
    });
  }

  public onAddAttachments(fileInfo: FileInfo[]) {
    this.currentOrder.AttachmentFiles.push(...fileInfo);
  }
  onOpenResourcesForm() {
    window.open(`/Pages/spa.aspx#/order-calculation/calculation?orderId=${this.currentOrder.ID}`, '_blank');
  }

  // Клик на кнопку смены формы просмотра на форму редактирования
  onEditForm() {
    this.ordersFormService.formType$.next(FormTypes.Edit);
  }
  /** Обработчик при изменении свитчера "Активный" */
  public onActiveChange(val: boolean, showConfirmWindow = true) {
    // если переводим в архив (Активный === false)
    if (val === false && showConfirmWindow) {
      this.form.controls.active.markAsTouched();
      const dRef = this.dialogService.open({
        title: 'Архивирование заказа',
        height: '40%',
        width: '40%',
        appendTo: this.archiveDialogContainer,
        content: this.archiveDialogTemplate,
        actions: [{ text: 'Да', primary: true }, { text: 'Отмена' }]
      });
      dRef.result.toPromise().then(val => {
        // если НЕ подтвердили архивацию
        if (val instanceof DialogCloseResult) {
          // переводим свитчер обратно в положение активный - true
          this.form.controls.active.setValue(true);
        } else if (!val.primary) {
          this.form.controls.active.setValue(true);
        }
      });
    }
    this.currentOrder.IsArchive = !val;
    this.setFormState();
  }

  public onStatusChange(val: string) {
    this.currentOrder.Status = val;
    if (val === OrderStatuses.Terminated) {
      const dRef = this.dialogService.open({
        title: `Изменение статуса`,
        width: '40%',
        appendTo: this.archiveDialogContainer,
        content: `После перевода заказа в статус "Расторгнут" заказ и все его ресурсы будут заархивированы. Изменить статус заказа?`,
        actions: [{ text: 'Да', primary: true }, { text: 'Отмена' }]
      });
      dRef.result.toPromise().then(val => {
        if ((val as any)?.primary) {
          // Если подтвердили изменение статуса заказа на "Расторгнут"
          this.form.controls.active.setValue(false, { emitEvent: false });
          this.onActiveChange(false, false);
        } else {
          // если НЕ подтвердили перевод в статус "Расторгнут"
          this.form.controls.Status.setValue(
            this.oldStatus === OrderStatuses.Terminated ? this.ordersStatuses[0] : this.oldStatus
          );
        }
      });
    }
  }

  /** Устанавливает форму в disabled или enabled состояние. */
  private setFormState() {
    this.formType === FormTypes.Edit && this.currentOrder && !this.currentOrder.IsArchive
      ? this.form.enable({ emitEvent: false })
      : this.form.disable({ emitEvent: false });
    if (this.formType === FormTypes.Edit && this.currentOrder && this.currentOrder.IsArchive) {
      this.form.controls.active.enable({ emitEvent: false });
    }
    // оставляем ChargeCode задезейбленным
    this.form.controls.ChargeCode.disable({ emitEvent: false });
    // оставляем "Расчетную выручку" задезейбленным
    this.form.controls.calculatedIncome.disable({ emitEvent: false });
    // оставляем Классификация задезейбленным
    this.form.controls.Classification.disable({ emitEvent: false });
    // оставляем Бюджет проекта 1С задезейбленным
    this.form.controls.OrderProject1CEstimateBudget.disable({ emitEvent: false });
    if (
      this.formType === FormTypes.Edit &&
      (this.currentOrder?.TariffChange || this.currentOrder?.Status === OrderStatuses.Concluded)
    ) {
      // Если переводим в режим редактирования и (тарифы меняются или заказа в статусе "Заключен"), то дизэйблим дату начала и дату окончания
      this.form.controls.StartDate.disable({ emitEvent: false });
      this.form.controls.EndDate.disable({ emitEvent: false });
    }
    if (
      this.formType === FormTypes.Edit &&
      this.currentOrder &&
      !(
        this.currentOrder.Status === OrderStatuses.CarriedOut ||
        this.currentOrder.Status === OrderStatuses.ServicesRendered
      )
    ) {
      this.form.controls.FactSigningDate.disable({ emitEvent: false });
      this.form.controls.ProvisionServiceDateFact.disable({ emitEvent: false });
    }
    if (
      this.formType === FormTypes.Edit &&
      this.currentOrder &&
      !(this.currentOrder.Status === OrderStatuses.Presale || this.currentOrder.Status === OrderStatuses.Agreed)
    ) {
      this.form.controls.PlanSigningDate.disable({ emitEvent: false });
    }
  }

  ngOnDestroy() {
    this.subscriptions.forEach(s => s.unsubscribe());
  }
}
