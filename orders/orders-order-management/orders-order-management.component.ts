import { Component, EventEmitter, OnDestroy, OnInit, ViewChild, ViewContainerRef } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Store } from '@ngrx/store';
import { Message, SendMessageEvent, User } from '@progress/kendo-angular-conversational-ui';
import { DialogCloseResult, DialogService } from '@progress/kendo-angular-dialog';
import { BehaviorSubject, combineLatest, Observable, Subject, Subscription, timer } from 'rxjs';
import { map } from 'rxjs/operators';
import { FormTypes, Order, SpModelService } from 'shared-lib';
import { NotificationService } from '../../core/services/notification.service';
import { Department } from '../../shared/models/Department';
import { OrderMessage } from '../../shared/models/OrderMessage';
import { OrderTask, OrderTaskStatuses } from '../../shared/models/OrderTask';
import { OrdersService } from '../services/orders.service';
import { CloseOrdertaskDialogComponent } from '../shared/close-ordertask-dialog/close-ordertask-dialog.component';
import { OrderCalculateDialogComponent } from '../shared/order-calculate-dialog/order-calculate-dialog.component';
import * as UserProfileSelectors from '../../store/user-profile/user-profile.selectors';
import * as OrdersSelectors from '../../store/user-profile/orders/orders.selectors';

@Component({
  selector: 'spa-orders-order-management',
  templateUrl: './orders-order-management.component.html',
  styleUrls: ['./orders-order-management.component.scss']
})
export class OrdersOrderManagementComponent implements OnInit, OnDestroy {
  @ViewChild('dialogContainer', { read: ViewContainerRef }) public dialogContainer: ViewContainerRef;

  public FormTypes = FormTypes;
  /** Сабж с ИД заказа который сейчас просматриваем. (берется из url) */
  public orderId$ = new BehaviorSubject<number>(null);
  /** Тип формы заказа в панели информации */
  public formType = FormTypes.View;
  /** Заказ который сейчас просматриваем с ID - orderId */
  public Order: BehaviorSubject<Order> = new BehaviorSubject<Order>(null);
  /** Свернута ли панель с чатом. Меняется при нажатии на кнопку "Чат" (chatCollapsed = !chatCollapsed) */
  public chatCollapsed = true;
  public OrderTaskStatuses = OrderTaskStatuses;
  /** Список всех задач для заказа с ID - orderId */
  public orderTasks: OrderTask[];
  /** Получаем/загружаем ли в данный момент список всех задач для текущего заказа */
  public orderTasksLoading = true;
  /** Список всех подразделений */
  public allDepartments: Department[];
  /** Есть ли у текущего пользователя права для нажатия кнопок вроде "Запросить расчёт" */
  public hasPermission$: Observable<boolean>;

  /** Загружается ли в данный момент грид с ресурсами. */
  public resorceGridLoading = true;

  public generateReportForContract = new Subject<any>();
  public generateReportFromGrid = new Subject<any>();

  /** Текущий пользователь для компоненты чата */
  public chatCurrentUser: User = {
    id: _spPageContextInfo.userId,
    name: _spPageContextInfo.userDisplayName
  };
  /** Все сообщения заказа */
  public chatMessages: Message[] = [];

  public onGroupBtnClick: EventEmitter<'Акты' | 'Заказы' | 'ПК'> = new EventEmitter<'Акты' | 'Заказы' | 'ПК'>();

  private subscriptions: { [key: string]: Subscription } = {};

  constructor(
    private route: ActivatedRoute,
    private spModelService: SpModelService,
    private notificationService: NotificationService,
    private ordersService: OrdersService,
    private dialogService: DialogService,
    private store: Store
  ) {}

  ngOnInit(): void {
    this.checkPermission();
    const routeSubscription = this.route.params.subscribe(params => {
      this.orderId$.next(params['orderId']);
      this.getOrder(() => {
        //
      });
      this.ordersService.getAllDepartmentsAsDep().then(
        deps => {
          this.allDepartments = deps;
          if (this.subscriptions?.updateSub) {
            this.subscriptions.updateSub.unsubscribe();
          }
          const updateSub = timer(0, 30000).subscribe(() => {
            this.updateOrderTasksGrid();
            this.getOrderMessages();
          });
          this.subscriptions.updateSub = updateSub;
        },
        reason => {
          console.log(reason);
        }
      );
    });
    this.subscriptions.routeSub = routeSubscription;
  }

  public onBtnGrpClick(name: 'Акты' | 'Заказы' | 'ПК') {
    this.onGroupBtnClick.emit(name);
  }

  public onChatCollapsedChange(collapsed: boolean) {
    this.chatCollapsed = collapsed;
    // кнопка отправления сообщения в кендо компоненте чата не имеет аттрибута типа button из-за чего страница на шарике перезакружается
    if (!collapsed) {
      setTimeout(() => {
        const button = document.getElementsByClassName('k-button-send')[0];
        if (button) {
          button.setAttribute('type', 'button');
        }
      }, 100);
    }
  }

  private getOrderMessages() {
    this.ordersService.getOrderMessages(this.orderId$.getValue()).then(
      data => {
        this.chatMessages = data.map(v => {
          return {
            author: {
              id: v.AuthorID,
              name: v.AuthorValue
            },
            text: v.MsgText,
            timestamp: v.Created
          } as Message;
        });
      },
      reason => {
        console.log(reason);
        this.notificationService.showNotification({
          content: 'Не удалось загрузить сообщения чата!',
          position: { horizontal: 'right', vertical: 'top' },
          closable: false,
          type: { style: 'error', icon: false }
        });
      }
    );
  }

  private getOrder(callback?: () => void) {
    this.spModelService.getModelById(this.orderId$.getValue(), Order).then(
      order => {
        this.Order.next(order);
        if (callback) {
          callback();
        }
      },
      reason => {
        console.log(reason);
        this.notificationService.showNotification({
          content: 'Не удалось загрузить данные по заказу!',
          position: { horizontal: 'right', vertical: 'top' },
          closable: false,
          type: { style: 'error', icon: false }
        });
      }
    );
  }

  private checkPermission() {
    // Если текущий пользователь в группе Сервис-менеджеров
    // или он ответсвенный по заказу или он создатель заказа
    // или он замещает ответсвенного по заказу который разрешил ему быть замещающим в расчёте заказов
    this.hasPermission$ = combineLatest([
      this.store.select(UserProfileSelectors.selectIsManager),
      this.store.select(OrdersSelectors.selectAllOrdersActiveWithSubstituteInOrders),
      this.Order
    ]).pipe(map(data => data[0] || data[1].some(v => v.ID === data[2]?.ID)));
  }

  private updateOrderTasksGrid() {
    this.orderTasksLoading = true;
    this.ordersService
      .getOrderTasksByOrderId(this.orderId$.getValue())
      .then(
        data => {
          this.orderTasks = data;
          this.orderTasks.forEach(ot => {
            const findedDep = this.allDepartments.find(v => v.ID === ot.DepartmentId);
            if (findedDep) {
              (ot as any).DepartmentManager = findedDep.ManagerValue;
            }
          });
        },
        reason => console.log(reason)
      )
      .finally(() => (this.orderTasksLoading = false));
  }

  /** Обработчик при нажатии на иконку отмены задачи*/
  public onCancelClick(item: OrderTask) {
    if (item.Status !== this.OrderTaskStatuses.Opened) {
      return;
    }
    const dRef = this.dialogService.open({
      content: 'Вы действительно хотите отменить задачу?',
      actions: [
        { text: 'Да', primary: true },
        { text: 'Нет', primary: false }
      ],
      appendTo: this.dialogContainer
    });
    dRef.result.toPromise().then(data => {
      if (data instanceof DialogCloseResult) {
        return;
      } else if (data.primary) {
        item.Status = this.OrderTaskStatuses.Canceled;
        this.spModelService.updateModel(item, OrderTask).then(
          () => {
            this.notificationService.showNotification({
              content: 'Задача успешно отменена.',
              position: { horizontal: 'right', vertical: 'top' },
              closable: false,
              width: 220,
              type: { style: 'success', icon: false }
            });
          },
          reason => {
            console.log(reason);
            this.notificationService.showNotification({
              content: 'Ошибка при попытке отменить задачу.',
              position: { horizontal: 'right', vertical: 'top' },
              closable: false,
              type: { style: 'error', icon: false }
            });
            item.Status = this.OrderTaskStatuses.Opened;
          }
        );
      }
    });
  }

  /** Нажатие на иконку закрытия задачи. */
  public onCloseClick(item: OrderTask) {
    if (item.Status !== this.OrderTaskStatuses.Opened) {
      return;
    }
    const dRef = this.dialogService.open({
      appendTo: this.dialogContainer,
      width: '40%',
      content: CloseOrdertaskDialogComponent
    });
    const curOrderTask = new OrderTask();
    Object.assign(curOrderTask, item);
    (dRef.content.instance as CloseOrdertaskDialogComponent).orderTask = curOrderTask;
    dRef.result.toPromise().then(data => {
      if (data instanceof DialogCloseResult) {
        return;
      }
      this.updateOrderTasksGrid();
      const orderMessage = new OrderMessage();
      orderMessage.MsgText = (data as any).comment
        ? `${this.chatCurrentUser.name} закрыл задачу с комментарием:\n${(data as any).comment}`
        : `${this.chatCurrentUser.name} закрыл задачу.`;
      orderMessage.OrderId = this.orderId$.getValue();
      this.spModelService.saveModel(orderMessage, OrderMessage).then(
        oMsg => {
          const msg = {
            author: {
              id: oMsg.AuthorID,
              name: oMsg.AuthorValue
            },
            text: oMsg.MsgText,
            timestamp: oMsg.Created
          } as Message;
          this.chatMessages = [...this.chatMessages, msg];
          this.notificationService.showNotification({
            content: `Задача успешно закрыта! Сообщение о закрытии отправлено в чат заказа.`,
            position: { horizontal: 'right', vertical: 'top' },
            width: 300,
            closable: false,
            hideAfter: 7000,
            type: { style: 'success', icon: false }
          });
        },
        reason => {
          console.log(reason);
          this.notificationService.showNotification({
            content: `Задача успешно закрыта! Однако сообщение о закрытии не было отправлено в чат заказа.`,
            position: { horizontal: 'right', vertical: 'top' },
            width: 300,
            closable: false,
            hideAfter: 7000,
            type: { style: 'warning', icon: false }
          });
        }
      );
    });
  }

  public requestCalculation() {
    const dRef = this.dialogService.open({
      appendTo: this.dialogContainer,
      height: '70%',
      width: '45%',
      content: OrderCalculateDialogComponent
    });
    (dRef.content.instance as OrderCalculateDialogComponent).orderId = this.orderId$.getValue();
    dRef.result.toPromise().then(data => {
      if (data instanceof DialogCloseResult) {
        return;
      }
      if ((data as any).needUpdate) {
        this.notificationService.showNotification({
          content: `Ваш запрос отправлен руководителям выбранных подразделений!
                    Как только каждый из руководителей закроет задачу, Вам будет отправлено уведомление на эл. почту`,
          position: { horizontal: 'right', vertical: 'top' },
          width: 400,
          closable: false,
          hideAfter: 7000,
          type: { style: 'success', icon: false }
        });
        this.updateOrderTasksGrid();
      }
    });
  }

  public onResorceGridLoading(val: boolean) {
    this.resorceGridLoading = val;
  }
  /** Обработчик на кнопке выгрузки отчета */
  public onReport() {
    this.generateReportFromGrid.next();
  }
  /** Обработчик на кнопке выгрузки заказа по форме */
  public onReportForm() {
    this.generateReportForContract.next();
  }

  /** Обработчик при отправки сообщения в чат заказа */
  public sendMessage(e: SendMessageEvent): void {
    const model = new OrderMessage();
    model.MsgText = e.message.text;
    model.OrderId = this.orderId$.getValue();

    this.spModelService
      .saveModel(model, OrderMessage)
      .then(() => {
        this.chatMessages = [...this.chatMessages, e.message];
      })
      .catch(err => {
        console.log(err);
        this.notificationService.showNotification({
          content: 'Ошибка при отправке сообщения в чат.',
          position: { horizontal: 'right', vertical: 'top' },
          closable: false,
          type: { style: 'error', icon: false }
        });
      });
  }

  /** Обработчик при успешном сохранении изменений заказа. */
  public onSaveOrder(order: Order) {
    this.Order.next(order);
    this.orderId$.next(this.orderId$.getValue());
    this.notificationService.showNotification({
      content: 'Заказ успешно изменен.',
      position: { horizontal: 'right', vertical: 'top' },
      closable: false,
      width: 220,
      type: { style: 'success', icon: false }
    });
  }

  public onCancelOrder() {
    this.orderId$.next(this.orderId$.getValue());
  }

  ngOnDestroy(): void {
    for (const key in this.subscriptions) {
      this.subscriptions[key].unsubscribe();
    }
  }
}
