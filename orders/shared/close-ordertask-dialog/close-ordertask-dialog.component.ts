import { Component, Input, OnInit } from '@angular/core';
import { DialogContentBase, DialogRef } from '@progress/kendo-angular-dialog';
import { SpModelService } from 'shared-lib';
import { OrderTask } from '../../../shared/models/OrderTask';

@Component({
  selector: 'spa-close-ordertask-dialog',
  templateUrl: './close-ordertask-dialog.component.html',
  styleUrls: ['./close-ordertask-dialog.component.scss']
})
export class CloseOrdertaskDialogComponent extends DialogContentBase implements OnInit {
  @Input() orderTask: OrderTask;

  public comment = '';
  public saveInProgress = false;

  constructor(public dialog: DialogRef, private spModelService: SpModelService) {
    super(dialog);
  }

  ngOnInit(): void {}

  public onCancelAction(ev): void {
    ev.preventDefault();
    if (this.saveInProgress) {
      return;
    }
    this.dialog.close();
  }

  public onSaveAction(ev): void {
    ev.preventDefault();
    if (this.saveInProgress) {
      return;
    }
    this.saveInProgress = true;
    this.orderTask.Status = OrderTask.OrderTaskStatuses.Closed;
    this.spModelService
      .updateModel(this.orderTask, OrderTask)
      .then(
        ot => {
          this.dialog.close({ comment: this.comment });
        },
        reason => {
          alert('Не удалось закрыть задачу!');
        }
      )
      .finally(() => (this.saveInProgress = false));
  }
}
