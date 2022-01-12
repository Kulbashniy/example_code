import { Component, OnInit, ViewChild, ViewContainerRef } from '@angular/core';
import { Router } from '@angular/router';
import { DialogCloseResult, DialogService } from '@progress/kendo-angular-dialog';
import { CellClickEvent, DataStateChangeEvent, GridDataResult } from '@progress/kendo-angular-grid';
import { process, SortDescriptor, State } from '@progress/kendo-data-query';
import { FormTypes, ILookupObj, Order } from 'shared-lib';
import { OrdersService } from '../../services/orders.service';
import { NewOrderDialogComponent } from '../../shared/new-order-dialog/new-order-dialog.component';
import { ViewEditOrderDialogComponent } from '../../shared/view-edit-order-dialog/view-edit-order-dialog.component';

@Component({
  selector: 'spa-orders-loss-grid',
  templateUrl: './orders-loss-grid.component.html',
  styleUrls: ['./orders-loss-grid.component.scss']
})
export class OrdersLossGridComponent implements OnInit {
  @ViewChild('newOrderWindowContainer', { read: ViewContainerRef }) public newOrderWindowContainer: ViewContainerRef;
  @ViewChild('viewOrderWindowContainer', { read: ViewContainerRef }) public viewOrderWindowContainer: ViewContainerRef;

  /** Начальная сортировка грида */
  public sort: SortDescriptor[] = [{ field: 'Title', dir: 'asc' }];
  /** Уникальные значения колонок для фильтров в этих колонках */
  public filterDict: { [fieldName: string]: any[] } = {};
  public spViewName = 'Расходные';
  public spListName = 'Заказы';

  constructor(private router: Router, private ordersService: OrdersService, private dialogService: DialogService) { 
    this.updateFilterDict();
  }

  ngOnInit(): void {}

  /** Обновляет значения для фильтрации строк по колонкам на основе списка заказов */
  private updateFilterDict() {
    this.filterDict = {
      Status: Order.OrderStatuses.AllStatuses.map(ss => {
        return { Status: ss };
      }),
      StatusState: Order.OrderStatusStates.AllStatusStates.map(v => {
        return { StatusState: v };
      }),
      Type: Order.OrderTypes.AllTypes.map(v => {
        return { Type: v };
      }),
      ExpenseType: Order.OrderExpenseTypes.AllExpenseTypes.map(v => {
        return { ExpenseType: v };
      })
    };
    // сортируем списки с значениями фильтров
    Object.getOwnPropertyNames(this.filterDict).forEach(field => {
      this.filterDict[field].sort((a, b) => (a[field].toLowerCase() > b[field].toLowerCase() ? 1 : -1));
    });
  }

  /** Обработчик на клик по любой яйчейке грида */
  public cellClickHandler(cellClickEvent: CellClickEvent) {
    const orderId = (cellClickEvent.dataItem as Order).ID;
    // если нужна страница управления заказом вместо диалогового окна с заказом,
    // то расскоментить нижнюю строчку и закоментить остальное
    // this.router.navigate(['/orders/order-management', orderId]);
    const dialogRef = this.dialogService.open({
      maxHeight: '98%',
      maxWidth: '40%',
      minHeight: '98%',
      minWidth: '40%',
      content: ViewEditOrderDialogComponent,
      appendTo: this.viewOrderWindowContainer
    });
    dialogRef.content.instance.orderId = orderId;
    dialogRef.content.instance.formType = FormTypes.View;
    dialogRef.result.toPromise().then(
      data => {
        if (data instanceof DialogCloseResult) {
          return;
        } else if (data instanceof Order) {
          // Измененный заказ
        }
      },
      err => {
        alert(err);
      }
    );
  }

  /** Обработчик на нажатие кнопки "Создать заказ" */
  public onNewOrderClick() {
    const dialogRef = this.dialogService.open({
      maxHeight: '98%',
      maxWidth: '60%',
      minHeight: '98%',
      minWidth: '60%',
      content: NewOrderDialogComponent,
      appendTo: this.newOrderWindowContainer
    });
    dialogRef.result.toPromise().then(
      data => {
        if (data instanceof DialogCloseResult) {
          return;
        } else if (data instanceof Order) {
          // Созданный заказ
        }
      },
      err => {
        alert(err);
      }
    );
  }

  public onDefaultView() {
    open(`${_spPageContextInfo.webAbsoluteUrl}/${Order.ListUrl}/all.aspx`, '_blank');
  }

  public getStringFromIObjArr(arr: ILookupObj[]): string {
    return arr.map(v => v.value).join(', ');
  }
}
