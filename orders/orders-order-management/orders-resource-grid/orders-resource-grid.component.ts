import { Component, EventEmitter, Input, NgZone, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';

import { BehaviorSubject, combineLatest, forkJoin, from, Observable, Subject, Subscription, timer, of } from 'rxjs';
import { concatMap, filter, map, switchMap, tap, catchError } from 'rxjs/operators';
import { State, process } from '@progress/kendo-data-query';
import { DataStateChangeEvent, GridComponent, PageChangeEvent, SelectableSettings } from '@progress/kendo-angular-grid';
import { saveAs } from '@progress/kendo-file-saver';
import {
  ExcelExportData,
  Workbook,
  WorkbookOptions,
  WorkbookSheet,
  WorkbookSheetRow,
  WorkbookSheetRowCell
} from '@progress/kendo-angular-excel-export';

import { Utils } from '../../../order-calculation/shared/Utils';
import { OrderResourceReport } from '../../../order-calculation/shared/models/OrderResourceReport';
import { OrderAlertsTypes, StaffTypes } from '../../../order-calculation/shared/static/consts';
import { OrderPeriodTemplate } from '../../../order-calculation/reports-page/models/OrderPeriodTemplate';
import { OrdersResourcesService } from '../../../order-calculation/shared/services/orders-resources.service';
import { ErrorService } from '../../../core/services/error.service';
import { LocalstorageService } from '../../../core/services/local-storage.service';
import { CommonService } from '../../../core/services/common.service';
import { Order } from '../../../shared/models/Order';
import { Employee } from '../../../shared/models/Employee';
import { Tariff } from '../../../shared/models/Tariff';
import { Contract } from '../../../shared/models/Contract';
import { OrderPeriod } from '../../../shared/models/OrderPeroid';
import { Calendar } from '../../../shared/models/Calendar';
import { Department } from '../../../shared/models/Department';
import { UserInfo } from '../../../shared/models/UserInfo';
import { OrderResourceEditing } from '../../../order-calculation/shared/models/OrderResourceEditing';
import { getOrderResourceGroupByResource } from '../../../shared/Utils';
import { OrderResourceGroup } from '../../../shared/components/order-resource-dialog/models/OrderResourceGroup';
import { OrderAlert } from '../../../shared/models/OrderAlert';
import { OrderResourceComment } from '../../../order-calculation/shared/models/OrderResourceComment';
import { OrderStatuses } from 'shared-lib';
import * as UserProfileSelectors from '../../../store/user-profile/user-profile.selectors';
import * as OrdersSelectors from '../../../store/user-profile/orders/orders.selectors';
import { Store } from '@ngrx/store';

@Component({
  selector: 'spa-orders-resource-grid',
  templateUrl: './orders-resource-grid.component.html',
  styleUrls: ['./orders-resource-grid.component.scss']
})
export class OrdersResourceGridComponent implements OnInit, OnDestroy {
  @Input() Order$: BehaviorSubject<Order>;
  /** Сабж который сообщает о необходимости сгенерировать отчёт из данных грида. */
  @Input() generateReportFromGrid: Subject<any>;
  /** Сабж который сообщает о необходимости сгенерировать отчёт по форме(договору). */
  @Input() generateReportForContract: Subject<any>;
  @Output() gridLoading = new EventEmitter<boolean>();

  @ViewChild('grid') grid: GridComponent;

  public aggregates: any[] = [
    { field: 'WorkCapacity', aggregate: 'sum' },
    { field: 'SumWithoutVAT', aggregate: 'sum' },
    { field: 'SumWithVAT', aggregate: 'sum' },
    { field: 'Value', aggregate: 'sum' }
  ];
  public gridState: State = {
    skip: 0,
    take: 10,
    group: [
      {
        field: 'PeriodValue',
        aggregates: this.aggregates
      }
    ]
  };
  public gridSelectableSettings: SelectableSettings = {
    checkboxOnly: true,
    mode: 'multiple'
  };
  gridSource: any;
  selectedGridRows: number[] = [];
  selectedOrders: Order[];
  ordersResourcesReports: OrderResourceReport[] = [];
  departments: Department[] = [];
  calendarItems: { [year: number]: { [month: number]: Calendar } };
  orders: Order[] = [];
  gridLoadingInProgress = false;
  private subscriptions: Subscription[] = [];
  currentYear: number;
  orderPeriods: OrderPeriod[] = [];
  distinctDict: { [key: string]: any[] } = {};

  contracts: Contract[] = [];
  tariffs: Tariff[] = [];
  employees: Employee[] = [];

  currentOrderPeriods: OrderPeriodTemplate[] = [];

  public OrderStatuses = OrderStatuses;
  /** Текущий заказ по которому необходимо показать ресурсы. Берется из Order$ */
  public Order: Order;
  /** Может ли текущий пользователь создавать ресурсы */
  public allowCreationResource = false;
  /** Информация о текущем пользователе */
  public userInfo: UserInfo;
  public currentOrderResource: OrderResourceGroup;
  public copiedOrdersResources: OrderResourceEditing[] = [];
  /** Показывать ли окно с комментариями к ресурсу. Также должен быть установлен commentOrderResourceId если показывать. */
  public showCommentsDialog = false;
  /** ИД ресурса комментарии которого необходимо показать */
  public commentOrderResourceId;
  /** Все комментарии к ресурсам текущего заказа */
  public allCommentsOfOrder: OrderResourceComment[] = [];
  /** Комментарии по выбранному ресурсу для окна-чата */
  public currentComments: OrderResourceComment[] = [];
  /** Есть ли у текущего пользователя права для просмотра денежных полей (поля стоимости и пр.) */
  public hasPermission$: Observable<boolean>;

  /** Идет ли расчёт ресурсов. */
  public calculateInProgress$: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);

  gridLoadingInProgressChange(value: boolean) {
    this.gridLoadingInProgress = value;
    this.gridLoading.emit(value);
  }

  constructor(
    private ordersResourcesService: OrdersResourcesService,
    private errorService: ErrorService,
    private ngZone: NgZone,
    private localStorageService: LocalstorageService,
    private commonService: CommonService,
    private store: Store
  ) {
    this.exportAllData = this.exportAllData.bind(this);
  }

  ngOnInit() {
    this.checkCalculate();
    this.checkPermission();
    const pageSizeFromLocalStorage = this.localStorageService.getLocalstorageItem('RtOrdersResourcesPageSize');
    if (pageSizeFromLocalStorage) {
      this.gridState.take = pageSizeFromLocalStorage;
    }

    const dataSub = combineLatest([this.Order$, this.commonService.userInfo$, this.commonService.dictionaries$])
      .pipe(filter(combinedSubj => combinedSubj.every(v => !!v)))
      .subscribe(data => {
        this.Order = data[0];
        this.userInfo = data[1];
        this.setAllowCreationResourceProp();
        this.calendarItems = data[2].calendar;
        this.departments = data[2].departments;
        this.orders = data[2].orders;
        this.contracts = data[2].contracts;
        this.tariffs = data[2].tariffs;
        this.employees = data[2].employees;
        // this.orders.forEach(o => {
        //   if (!o.StartDate || !o.EndDate) {
        //     return;
        //   }
        //   o.WorkDaysCount = this.getWorkDaysBetweenDates(new Date(o.StartDate.getTime()), new Date(o.EndDate.getTime()));
        // });
        this.orderPeriods = data[2].orderPeriods;
        this.initGridData();
        this.updateGridSource();
      });
    this.subscriptions.push(dataSub);
    this.subOnReportCommands();
  }

  private checkPermission() {
    // Если текущий пользователь в группе Сервис-менеджеров
    // или он ответсвенный по заказу или он создатель заказа
    // или он замещает ответсвенного по заказу который разрешил ему быть замещающим в расчёте заказов
    this.hasPermission$ = combineLatest([
      this.store.select(UserProfileSelectors.selectIsManager),
      this.store.select(OrdersSelectors.selectAllOrdersActiveWithSubstituteInOrders),
      this.Order$
    ]).pipe(map(data => data[0] || data[1].some(v => v.ID === data[2]?.ID)));
  }

  /** Обработчик на кнопке "Пересчитать ресурсы" */
  public onCalculateResources() {
    const orderId = this.Order$.getValue().ID;
    if (!orderId) {
      return;
    }
    this.ordersResourcesService
      .startOrderResourceCalculate(orderId)
      .then(taskId => {
        const dictCalc: {
          [orderId: number]: { inProgress: boolean; orderId: number; taskId?: string; hasSub?: boolean };
        } = this.localStorageService.getLocalstorageItem('RtOrdersResourcesCalculates') || {};
        const val = {
          orderId,
          taskId,
          inProgress: true,
          hasSub: true
        };
        dictCalc[orderId] = val;
        this.localStorageService.saveLocalStorageItem(dictCalc, 'RtOrdersResourcesCalculates');
        this.calculateInProgress$.next(true);
        this.subOnCheckCalculate(val);
      })
      .catch(reason => {
        console.log(reason);
        alert(reason);
      });
  }

  /** Создает обсерв на текущем заказе и изменяемом заказе который берет из локал стораджа клиента незавершенные таски по расчету
   * и запрашивает информацию по ним.
   */
  private checkCalculate() {
    const sub = this.Order$.pipe(
      map(v => {
        const dictCalc: {
          [orderId: number]: { inProgress: boolean; orderId: number; taskId?: string; hasSub?: boolean };
        } = this.localStorageService.getLocalstorageItem('RtOrdersResourcesCalculates') || {};
        return dictCalc[v.ID];
      }),
      tap(v => this.calculateInProgress$.next(v?.inProgress ? true : false)),
      // фильтруем чтобы был номер задачи и пересчет был в процессе и не было подписок на него
      filter(v => v && v.taskId && v.inProgress && !v.hasSub)
    ).subscribe(v => this.subOnCheckCalculate(v));
    this.subscriptions.push(sub);
  }

  /** На основе локал стораджа и переданной информации о таске из локалстораджа создает интервальный обсерв, который
   * каждые пять секунд опрашивает сервер о состоянии таски и при успешном или ошибочном завершении переписывает инфу
   * в локал стородже и устанавливает значение calulateInProgress$ в false если это таска пересчета по текущему заказу.
   */
  private subOnCheckCalculate(val: { inProgress: boolean; orderId: number; taskId?: string; hasSub?: boolean }) {
    const sub = timer(0, 5000)
      .pipe(
        switchMap(() => this.ordersResourcesService.infoOrderResourceCalculate(val.taskId)),
        catchError(() => of(`Произошла ошибка при попытке получить информацию о таске с расчётом - ${val?.orderId}`))
      )
      .subscribe(v => {
        if (typeof v === 'string') {
          // Есил вернулась строка, то пишем в консоль ошибку.
          console.error(v);
          return;
        }
        if (v.state == 'Completed' || v.state == 'Error') {
          if (v.state == 'Error') {
            // Выводим в консоль весь объект полученный при ошибке на стороне сервера
            console.error(v);
          }
          sub.unsubscribe();
          const dictCalc: {
            [orderId: number]: { inProgress: boolean; orderId: number; taskId?: string; hasSub?: boolean };
          } = this.localStorageService.getLocalstorageItem('RtOrdersResourcesCalculates');
          dictCalc[val.orderId].hasSub = false;
          dictCalc[val.orderId].inProgress = false;
          this.localStorageService.saveLocalStorageItem(dictCalc, 'RtOrdersResourcesCalculates');
          if (val.orderId === this.Order$.getValue().ID) {
            // Если текущая подписка на пересчет - это пересчет по текущему заказу, то показываем что он завершился
            this.calculateInProgress$.next(false);
            // И обновляем грид с ресурсами
            this.updateGridSource();
          }
        }
      });
    this.subscriptions.push(sub);
  }

  private initGridData() {
    this.selectedOrders = [this.Order];
    this.currentOrderPeriods = [];
    if (this.selectedOrders.length === 1) {
      const orderPeriods = this.orderPeriods.filter(o => o.OrderID === this.selectedOrders[0].ID);
      orderPeriods.forEach(p => {
        this.currentOrderPeriods.push(Object.assign(new OrderPeriodTemplate(), p));
      });
    }
  }
  /** Подписывается на сабжы которые сообщают о необходимости сгенерировать отчёт. */
  private subOnReportCommands() {
    const rep1Sub = this.generateReportFromGrid.subscribe(() => {
      this.grid.saveAsExcel();
    });
    const rep2Sub = this.generateReportForContract.subscribe(() => {
      this.onGenerateReportForContract();
    });
    this.subscriptions.push(rep1Sub, rep2Sub);
  }
  private setAllowCreationResourceProp() {
    if (!this.Order || !this.userInfo) {
      return;
    }
    if (
      (this.Order.ResponsibleUserID === this.userInfo.ID ||
        this.userInfo.IsManager ||
        this.userInfo.ExistInServiceManagersGroup ||
        this.userInfo.Substitutes.some(
          s => s.ReplacedEmployeeID === this.Order.ResponsibleUserID && s.AllowInOrderResources
        )) &&
      this.Order.Status !== 'Заключен' &&
      this.Order.Status !== 'К расторжению'
    ) {
      this.allowCreationResource = true;
    } else {
      this.allowCreationResource = false;
    }
  }
  public dataStateChange(state: DataStateChangeEvent): void {
    if (state && state.group) {
      state.group.map(group => (group.aggregates = this.aggregates));
    }
    this.gridState = state;
    this.gridSource = process(this.ordersResourcesReports, this.gridState);
  }
  private updateGridSource() {
    if (!this.departments || !this.selectedOrders || this.selectedOrders.length === 0 || !this.userInfo) {
      this.ordersResourcesReports = [];
      this.gridSource = process(this.ordersResourcesReports, this.gridState);
      return;
    }
    this.ngZone.run(() => {
      this.gridLoadingInProgressChange(true);
      const ordersIds = this.selectedOrders.map(o => o.ID);
      forkJoin([
        this.ordersResourcesService.getOrderResourcesByFieldIds(ordersIds, 'OrderResourceOrder'),
        this.ordersResourcesService.getOrderResourcesCosts(ordersIds)
      ])
        .pipe(
          concatMap(v =>
            from(this.ordersResourcesService.getOrderResourcesComments(v[0].map(or => or.ID))).pipe(
              map(orc => {
                return {
                  orderResources: v[0],
                  orderResourceCosts: v[1],
                  orderResourceComments: orc
                };
              })
            )
          )
        )
        .subscribe(
          data => {
            this.allCommentsOfOrder = data.orderResourceComments;
            this.ordersResourcesReports = [];
            //  this.ordersResources = data.filter((o) => o.ApprovalStatus === ApprovalStatuses.agreed);
            const groupedByOrderID = this.groupBy(data.orderResources, 'OrderID');
            for (const orderId of Object.keys(groupedByOrderID)) {
              const currentOrder = this.orders.find(o => o.ID === +orderId);
              groupedByOrderID[orderId].forEach(orderResource => {
                const currentReportItem: OrderResourceReport = Object.assign(new OrderResourceReport(), orderResource);
                currentReportItem.OrderServices = '';
                currentReportItem.OrderStartDate = currentOrder.StartDate;
                currentReportItem.OrderEndDate = currentOrder.EndDate;
                currentReportItem.OrderStatus = currentOrder.Status;
                const currentDepartment = this.departments.find(o => o.ID === currentReportItem.DepartmentID);
                if (currentDepartment) {
                  currentReportItem.DepartmentDirection2 = currentDepartment.Direction2;
                  currentReportItem.DepartmentDivision = currentDepartment.Division;
                  currentReportItem.DepartmentSubdivision = currentDepartment.Subdivision;
                  currentReportItem.DepartmentGroup = currentDepartment.Group;
                  currentReportItem.ServiceType = currentDepartment.ServiceTypeValue;
                }
                if (!currentReportItem.StartDate) {
                  currentReportItem.StartDate = currentOrder.StartDate;
                }
                if (!currentReportItem.EndDate) {
                  currentReportItem.EndDate = currentOrder.EndDate;
                }
                const resources = this.splitResourceByOrderPeriods(currentReportItem, currentOrder);
                resources.forEach(resource => {
                  const currentOrCost = data.orderResourceCosts.find(
                    o =>
                      o.OrderID === resource.OrderID && o.PeriodID === resource.PeriodID && o.ResourceID === resource.ID
                  );
                  if (currentOrCost) {
                    resource.WorkCapacity = currentOrCost.WorkCapacity;
                    resource.TariffRate = currentOrCost.TariffRate;
                    resource.SumWithoutVAT = currentOrCost.SumWithoutVAT;
                    resource.SumWithVAT = currentOrCost.SumWithVAT;
                  } else {
                    resource.WorkCapacity = 0;
                    resource.TariffRate = 0;
                    resource.SumWithoutVAT = 0;
                    resource.SumWithVAT = 0;
                  }
                  this.setStaffType(resource);
                  if (
                    this.userInfo.MyAgreementDepartments.some(o => o.ID === resource.DepartmentID) ||
                    resource.AuthorID === this.userInfo.ID ||
                    currentOrder.ResponsibleUserID === this.userInfo.ID ||
                    this.userInfo.Substitutes.some(
                      s => s.ReplacedEmployeeID === currentOrder.ResponsibleUserID && s.AllowInOrderResources
                    ) ||
                    this.userInfo.ExistInServiceManagersGroup
                  ) {
                    (resource as any).AllowEditing = true;
                  } else {
                    (resource as any).AllowEditing = false;
                  }
                  this.ordersResourcesReports.push(resource);
                });
              });
            }
            this.createFilterSources();
            this.gridSource = process(this.ordersResourcesReports, this.gridState);
          },
          err => this.errorService.showError(err),
          () => this.gridLoadingInProgressChange(false)
        );
    });
  }
  public exportAllData(): ExcelExportData {
    const result: ExcelExportData = {
      data: process(this.ordersResourcesReports, { group: this.gridState.group }).data,
      group: this.gridState.group
    };
    return result;
  }
  gridPageChange({ skip, take }: PageChangeEvent) {
    this.localStorageService.saveLocalStorageItem(take, 'RtOrdersResourcesPageSize');
  }
  gridSelectedKeysChange(rows: number[]) {
    this.selectedGridRows = rows;
  }
  private groupBy(items: Array<object>, key: string) {
    return items.reduce((rv, x) => {
      (rv[x[key]] = rv[x[key]] || []).push(x);
      return rv;
    }, {});
  }
  createFilterSources() {
    this.distinctDict = Utils.getDistinctDict(this.ordersResourcesReports);
  }
  getTotalValue(field: string, numberDigits: number) {
    let sum = 0;
    this.ordersResourcesReports.forEach(resource => {
      if (resource[field]) {
        sum += resource[field];
      }
    });
    return +sum.toFixed(numberDigits);
  }
  private splitResourceByOrderPeriods(resource: OrderResourceReport, order: Order): OrderResourceReport[] {
    const orderPeriods = this.orderPeriods.filter(o => o.OrderID === order.ID);
    if (orderPeriods.length === 0) {
      const contract = this.contracts.find(o => o.ID === order.ContractID);
      if (contract && contract.Tariffs.length) {
        const primeTariff = this.tariffs.find(
          o => o.Type === 'Себестоимость' && !!contract.Tariffs.find(e => e.id === o.ID)
        );
        if (primeTariff) {
          resource.TariffID = primeTariff.ID;
        } else {
          resource.TariffID = contract.Tariffs[0].id;
        }
      }
      return [resource];
    }
    const result: OrderResourceReport[] = [];
    orderPeriods.forEach(period => {
      if (period.StartDate <= resource.EndDate && resource.StartDate <= period.EndDate) {
        const newResource = Object.assign(new OrderResourceReport(), resource);
        if (newResource.EndDate > period.EndDate) {
          newResource.EndDate = new Date(period.EndDate);
        }
        if (newResource.StartDate < period.StartDate) {
          newResource.StartDate = new Date(period.StartDate);
        }
        newResource.TariffID = period.TariffID;
        newResource.PeriodID = period.ID;
        newResource.PeriodValue = `${period.StartDate.format('dd.MM.yyyy')} - ${period.EndDate.format('dd.MM.yyyy')}`;
        result.push(newResource);
      }
    });
    return result;
  }
  onChangeSelectedPeriods() {
    this.gridLoadingInProgressChange(true);
    const filteredResources = [];
    this.currentOrderPeriods.forEach(period => {
      if (period.Checked) {
        filteredResources.push(...this.ordersResourcesReports.filter(o => o.PeriodID === period.ID));
      }
    });
    this.gridSource = process(filteredResources, this.gridState);
    this.gridLoadingInProgressChange(false);
  }
  setStaffType(resource: OrderResourceReport) {
    if (!resource.EmployeeID) {
      resource.StaffType = StaffTypes.Notdefined;
      return;
    }
    const empl = this.employees.find(o => o.ID === resource.EmployeeID);
    if (!empl) {
      return;
    }
    if (empl.IsVacation) {
      resource.StaffType = StaffTypes.Vacancy;
      return;
    }
    if (empl.WorkStatus === 'Уволен') {
      resource.StaffType = StaffTypes.Dismissed;
    } else {
      resource.StaffType = StaffTypes.Employee;
    }
    return;
  }
  removeHandler({ dataItem }): void {
    if (this.gridLoadingInProgress || !confirm('Действительно переместить ресурс заказа в архив?')) {
      return;
    }
    this.gridLoadingInProgressChange(true);
    this.ordersResourcesService
      .setArchiveState([dataItem.ID])
      .then(data => {
        this.updateGridSource();
        this.updateOrderState(dataItem.OrderID, OrderAlertsTypes.DeleteResource, dataItem.ID);
      })
      .catch(err => {
        this.errorService.showError(err);
      })
      .finally(() => {
        this.gridLoadingInProgressChange(false);
      });
  }
  onOpenCopyOrderResourceDialog(orderResource: OrderResourceEditing) {
    this.copiedOrdersResources = [].concat(Object.assign(new OrderResourceEditing(), orderResource));
  }
  onOpenCommentsDialog(resource: OrderResourceReport) {
    this.commentOrderResourceId = resource.ID;
    this.currentComments = this.allCommentsOfOrder.filter(o => o.OrderResourceID === resource.ID);
    this.showCommentsDialog = true;
  }
  onCloseCommentsDialog(success: boolean) {
    this.updateGridSource();
    this.showCommentsDialog = false;
    this.currentComments = [];
    this.commentOrderResourceId = null;
  }
  /** Обработчик при нажатии кнопки Создать ресурс */
  public openOrderResourceDialog(orderResource?: OrderResourceEditing) {
    if (!orderResource && (!this.Order || !this.allowCreationResource)) {
      return;
    }
    const employee = orderResource ? this.employees.find(o => o.ID === orderResource.EmployeeID) : null;
    this.currentOrderResource = getOrderResourceGroupByResource(orderResource, this.Order, employee);
  }
  /** Обработчик при нажатии кнопки Копировать выделенные */
  public onCopySelectedOrdersResources() {
    const ordersResourcesForCopy = [];
    this.selectedGridRows.forEach(index => {
      const currentResoure = this.ordersResourcesReports.find(o => o.ID === index);
      if (currentResoure) {
        ordersResourcesForCopy.push(Object.assign(new OrderResourceEditing(), currentResoure));
      }
    });
    this.copiedOrdersResources = ordersResourcesForCopy;
  }
  /** Обработчик при нажатии кнопки Архивировать выделенное */
  onDeletedSelectedOrdersResources() {
    if (!confirm('Действительно архивировать выделенные ресурсы?')) {
      return;
    }
    this.gridLoadingInProgressChange(true);
    this.ordersResourcesService
      .setArchiveState(this.selectedGridRows)
      .then(data => {
        this.selectedGridRows.forEach(id => {
          const currentResource = this.ordersResourcesReports.find(o => o.ID === id);
          this.updateOrderState(currentResource ? currentResource.OrderID : 0, OrderAlertsTypes.DeleteResource, id);
        });
        this.selectedGridRows = [];
        this.updateGridSource();
      })
      .catch(err => {
        this.errorService.showError(err);
      })
      .finally(() => {
        this.gridLoadingInProgressChange(false);
      });
  }
  onCloseCopyOrderResourceDialog() {
    this.updateGridSource();
    this.copiedOrdersResources = [];
  }
  onCloseOrderResourceDialog(needUpdate: boolean) {
    if (!needUpdate) {
      this.currentOrderResource = null;
      return;
    } else {
      this.updateGridSource();
    }
  }
  updateOrderState(orderId: number, type: OrderAlertsTypes, resourceID?: number) {
    const alertModel = new OrderAlert(orderId, 'Новое', type, resourceID + '');

    this.ordersResourcesService
      .saveOrderAlert(alertModel)
      .then(data => {})
      .catch(err => {
        this.errorService.showError(err);
      });
  }

  onGenerateReportForContract() {
    this.gridLoadingInProgressChange(true);
    const sheet: WorkbookSheet = {};
    sheet.name = 'Расчёт по форме заказа';
    sheet.columns = [
      { width: 60 },
      { width: 200 },
      { width: 200 },
      { width: 250 },
      { width: 250 },
      { width: 150 },
      { width: 100 },
      { width: 100 },
      { width: 100 },
      { width: 150 },
      { width: 150 }
    ];
    const emptyRow: WorkbookSheetRow = {
      cells: Array(11)
        .fill(0)
        .map<WorkbookSheetRowCell>((v, i) => {
          return {};
        })
    };
    const orderInfoRow: WorkbookSheetRow = {
      cells: [
        {
          value: `Заказ ${this.selectedOrders[0].Title} (${this.selectedOrders[0].ChargeCode})`,
          colSpan: 5,
          bold: true
        },
        ...Array(10)
          .fill(0)
          .map<WorkbookSheetRowCell>((v, i) => {
            return {};
          })
      ]
    };
    const firstRow: WorkbookSheetRow = { height: 82 };
    const headerCellOptionsDict: WorkbookSheetRowCell = {
      verticalAlign: 'center',
      textAlign: 'center',
      // color: '#FFFFFF',
      // background: '#1F4E78',
      bold: true,
      wrap: true,
      borderTop: { size: 1, color: '#000000' },
      borderLeft: { size: 1, color: '#000000' },
      borderRight: { size: 1, color: '#000000' }
    };
    firstRow.cells = [
      {
        ...headerCellOptionsDict,
        value: '№'
      },
      {
        ...headerCellOptionsDict,
        value: 'Наименование Услуг'
      },
      {
        ...headerCellOptionsDict,
        value: 'Ставка специалистов Исполнителя за день работы без НДС, в руб.'
      },
      {
        ...headerCellOptionsDict,
        value: 'Роль'
      },
      {
        ...headerCellOptionsDict,
        value: 'Функции специалиста'
      },
      {
        ...headerCellOptionsDict,
        value: 'Регион'
      },
      {
        ...headerCellOptionsDict,
        value: 'Трудоемкость, человеко-днях'
      },
      {
        ...headerCellOptionsDict,
        value: 'Сумма без НДС, руб.'
      },
      {
        ...headerCellOptionsDict,
        value: 'Сумма с НДС, руб.'
      },
      {
        ...headerCellOptionsDict,
        value: 'Дата начала оказания Услуг'
      },
      {
        ...headerCellOptionsDict,
        value: 'Дата окончания оказания услуг'
      }
    ];
    sheet.rows = [emptyRow, emptyRow, orderInfoRow, emptyRow, firstRow];

    const administrationResources = this.ordersResourcesReports
      .filter(o => o.ServiceType === 'Администрирование')
      .map(o => {
        return { ...o, RegionValue: 'Москва' } as OrderResourceReport;
      });
    const techSupportResources = this.ordersResourcesReports.filter(o => o.ServiceType === 'Техподдержка');

    const generateReportRows = (
      resources: OrderResourceReport[],
      serviceType: string,
      serviceNumber: number
    ): WorkbookSheetRow[] => {
      const rows: WorkbookSheetRow[] = [];
      resources.forEach((r, index) => {
        const preparedCells: WorkbookSheetRowCell[] = [];
        if (index === 0) {
          preparedCells.push(
            {
              value: serviceNumber,
              rowSpan: resources.length,
              verticalAlign: 'center'
            },
            {
              value: serviceType,
              rowSpan: resources.length,
              wrap: true,
              verticalAlign: 'center'
            }
          );
        }
        preparedCells.push(
          {
            value: r.TariffRate
          },
          {
            value: r.PositionValue
          },
          {
            value: r.RoleValue
          },
          {
            value: r.RegionValue
          },
          {
            value: r.WorkCapacity
          },
          {
            value: r.SumWithoutVAT
          },
          {
            value: r.SumWithVAT
          },
          {
            value: r.StartDate
          },
          {
            value: r.EndDate
          }
        );
        preparedCells.forEach(cell => {
          cell.borderLeft = { color: '#000000', size: 1 };
          cell.borderRight = { color: '#000000', size: 1 };
          cell.borderBottom = { color: '#000000', size: 1 };
        });
        rows.push({
          cells: preparedCells
        });
      });
      return rows;
    };
    sheet.rows.push(
      ...generateReportRows(
        administrationResources,
        'Эксплуатация Облаков, ИТ-инфраструктур, информационных систем и Сервисных платформ',
        1
      )
    );
    sheet.rows.push(
      ...generateReportRows(
        techSupportResources,
        'Техническая поддержка Облаков, ИТ-инфраструктур, Информационных систем и Сервисных платформ',
        administrationResources.length !== 0 ? 2 : 1
      )
    );
    const sumWithVAT = +this.ordersResourcesReports
      .reduce((prev, current) => {
        return (prev += current.SumWithVAT);
      }, 0)
      .toFixed(2);
    const sumwithoutVAT = +this.ordersResourcesReports
      .reduce((prev, current) => {
        return (prev += current.SumWithoutVAT);
      }, 0)
      .toFixed(2);
    const totalRow: WorkbookSheetRow = {
      height: 30,
      cells: [
        {
          value: 'Итого:',
          bold: true,
          colSpan: 7
        },
        {
          value: sumwithoutVAT,
          bold: true
        },
        {
          value: sumWithVAT,
          bold: true
        },
        {
          value: this.ordersResourcesReports.sort((a, b) => {
            return a.StartDate.getTime() - b.StartDate.getTime();
          })[0].StartDate,
          bold: true
        },
        {
          value: this.ordersResourcesReports.sort((a, b) => {
            return a.EndDate.getTime() - b.EndDate.getTime();
          })[this.ordersResourcesReports.length - 1].EndDate,
          bold: true
        }
      ]
    };
    totalRow.cells.forEach(cell => {
      cell.borderLeft = { color: '#000000', size: 1 };
      cell.borderRight = { color: '#000000', size: 1 };
      cell.borderBottom = { color: '#000000', size: 1 };
    });
    sheet.rows.push(totalRow);

    const VATRow: WorkbookSheetRow = {
      cells: [
        {
          value: 'Сумма НДС (20%), руб.',
          bold: true,
          colSpan: 6
        },
        {
          value: +(sumWithVAT - sumwithoutVAT).toFixed(2),
          bold: true
        },
        {},
        {},
        {},
        {}
      ]
    };
    VATRow.cells.forEach(cell => {
      cell.borderLeft = { color: '#000000', size: 1 };
      cell.borderRight = { color: '#000000', size: 1 };
      cell.borderBottom = { color: '#000000', size: 1 };
    });
    sheet.rows.push(VATRow);

    sheet.frozenRows = 5;
    const options: WorkbookOptions = {
      sheets: [sheet]
    };
    const workBook = new Workbook(options);
    const curDate = new Date();
    workBook.toDataURL().then(dataUrl => {
      saveAs(
        dataUrl,
        `Расчёт по форме заказа ${this.selectedOrders[0].Title +
          ' (' +
          this.selectedOrders[0].ChargeCode +
          ')'} к договору ${curDate.getDate()}.${curDate.getMonth() + 1}.${curDate.getFullYear()}.xlsx`
      );
      this.gridLoadingInProgressChange(false);
    });
  }
  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    const dictCalc = this.localStorageService.getLocalstorageItem('RtOrdersResourcesCalculates') || {};
    if (!dictCalc) {
      return;
    }
    for (const key in dictCalc) {
      dictCalc[key].hasSub = false;
    }
    this.localStorageService.saveLocalStorageItem(dictCalc, 'RtOrdersResourcesCalculates');
  }
}
