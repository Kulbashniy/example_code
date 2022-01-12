import { Component, OnInit } from '@angular/core';
import { DialogContentBase, DialogRef } from '@progress/kendo-angular-dialog';
import { Order } from 'shared-lib';

@Component({
  selector: 'spa-new-order-dialog',
  templateUrl: './new-order-dialog.component.html',
  styleUrls: ['./new-order-dialog.component.scss']
})
export class NewOrderDialogComponent extends DialogContentBase implements OnInit {
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

  public onSaveAction(order: Order): void {
    this.dialog.close(order);
  }
}
