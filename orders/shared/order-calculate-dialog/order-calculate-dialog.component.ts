import { AfterViewInit, Component, Input, OnInit, ViewChild } from '@angular/core';
import { DialogContentBase, DialogRef } from '@progress/kendo-angular-dialog';
import { MultiSelectComponent } from '@progress/kendo-angular-dropdowns';
import { from } from 'rxjs';
import { map, switchMap, tap } from 'rxjs/operators';
import { SpModelService } from 'shared-lib';

import { Department } from '../../../shared/models/Department';
import { OrderTask } from '../../../shared/models/OrderTask';
import { OrdersService } from '../../services/orders.service';

@Component({
  selector: 'spa-order-calculate-dialog',
  templateUrl: './order-calculate-dialog.component.html',
  styleUrls: ['./order-calculate-dialog.component.scss']
})
export class OrderCalculateDialogComponent extends DialogContentBase implements OnInit, AfterViewInit {
  @Input() orderId: number;
  @ViewChild('multiselectDepartments') public multiselectDepartments: MultiSelectComponent;

  public saveInProgress = false;
  public modelToSave: { departments: number[]; endDate: Date; comment: string } = {
    departments: [],
    endDate: new Date(),
    comment: ''
  };
  public departmentsLoading = true;
  public departments: Department[];
  private departmentsSource: Department[];
  /** Минимально возможная дата при выборе срока. */
  public minDate: Date = new Date();

  constructor(public dialog: DialogRef, private ordersService: OrdersService, private spModelService: SpModelService) {
    super(dialog);
  }

  ngOnInit(): void {
    this.ordersService
      .getAllDepartmentsAsDep()
      .then(data => {
        this.departments = data;
        this.departmentsSource = data;
      })
      .finally(() => (this.departmentsLoading = false));
  }

  ngAfterViewInit(): void {
    this.setFilterForDepartmentMultiselect();
  }

  private setFilterForDepartmentMultiselect() {
    const contains = (value: string) => (s: Department) =>
      s.Title?.toLowerCase().includes(value.toLowerCase()) ||
      s.ManagerValue?.toLowerCase().includes(value.toLowerCase());

    this.multiselectDepartments.filterChange
      .asObservable()
      .pipe(
        switchMap(value =>
          from([this.departmentsSource]).pipe(
            tap(() => (this.departmentsLoading = true)),
            map(data => {
              return value?.length >= 3 ? data.filter(contains(value)) : data;
            })
          )
        )
      )
      .subscribe(x => {
        this.departments = x;
        this.departmentsLoading = false;
      });
  }

  public validate(): boolean {
    const curDate = new Date();
    curDate.setHours(0, 0, 0, 0);
    return this.modelToSave.departments &&
      this.modelToSave.departments.length &&
      this.modelToSave.endDate &&
      this.modelToSave.endDate >= curDate &&
      this.orderId
      ? true
      : false;
  }

  public onCancelAction(ev): void {
    ev.preventDefault();
    if (this.saveInProgress) {
      return;
    }
    this.dialog.close();
  }

  public onSaveAction(ev): void {
    ev.preventDefault();
    if (this.saveInProgress || !this.validate()) {
      return;
    }
    this.saveInProgress = true;
    const tasksToSave = this.modelToSave.departments.map(depId => {
      const result = new OrderTask();
      result.OrderId = this.orderId;
      result.DepartmentId = depId;
      result.Comment = this.modelToSave.comment;
      result.EndDate = this.modelToSave.endDate;
      result.Status = OrderTask.OrderTaskStatuses.Opened;
      return result;
    });
    Promise.all(
      tasksToSave.map(task => {
        return this.spModelService.saveModel(task, OrderTask);
      })
    )
      .then(() => {
        this.dialog.close({ needUpdate: true });
      })
      .finally(() => {
        this.saveInProgress = false;
      })
      .catch(reason => {
        console.log(reason);
        alert('Не удалось сохранить задачи.');
      });
  }
}
