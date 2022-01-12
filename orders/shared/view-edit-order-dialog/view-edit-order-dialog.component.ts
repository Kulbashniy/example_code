import { Component, OnInit } from '@angular/core';
import { DialogContentBase, DialogRef } from '@progress/kendo-angular-dialog';
import { BehaviorSubject } from 'rxjs';
import { Order } from 'shared-lib';

@Component({
  selector: 'spa-view-edit-order-dialog',
  templateUrl: './view-edit-order-dialog.component.html',
  styleUrls: ['./view-edit-order-dialog.component.scss']
})
export class ViewEditOrderDialogComponent extends DialogContentBase implements OnInit {
  /** Тип формы "View" или "Edit". См. FormTypes */
  public formType: string;
  /** Сабж с ИД заказа */
  public orderId$: BehaviorSubject<number> = new BehaviorSubject<number>(null);
  /** Ид заказа */
  public set orderId(id: number) {
    this.orderId$.next(id);
  }

  constructor(public dialog: DialogRef) {
    super(dialog);
  }

  ngOnInit(): void {}

  public onCancelAction(ev?): void {
    if (ev) {
      ev.preventDefault();
    }
    this.dialog.close();
  }

  public onSaveAction(order: Order) {
    this.dialog.close(order);
  }
}
