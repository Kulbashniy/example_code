import { Component, OnDestroy, OnInit, Input, Output, EventEmitter } from '@angular/core';
import { Subscription } from 'rxjs';
import { Order } from '../../../models/Order';
import { OrdersFormService } from '../../../services/ordersForm.service';

import { Tariff, OrderPeriod } from 'shared-lib';
import { FormArray, FormBuilder, FormControl, FormGroup, ValidationErrors, Validators } from '@angular/forms';

@Component({
  selector: 'or-lib-order-periods',
  templateUrl: './order-periods.component.html',
  styleUrls: ['./order-periods.component.scss']
})
export class OrderPeriodsComponent implements OnInit, OnDestroy {
  subscriptions: Subscription[] = [];
  tariffs: Tariff[];
  public form: FormArray;
  public loading = true;

  @Input() disabled?: boolean = false;
  @Input() currentOrder: Order;
  @Input() orderPeriodsControl: FormControl;

  @Output() orderPeriodsChange: EventEmitter<OrderPeriod[]> = new EventEmitter<OrderPeriod[]>();

  constructor(private ordersFormService: OrdersFormService, private formBuilder: FormBuilder) {}

  ngOnInit() {
    const dictSub = this.ordersFormService.orderPeriodsDict$.subscribe(data => {
      if (!data) {
        return;
      }
      this.tariffs = data.tariffs;

      const periodsIntersectValidator = (fa: FormArray): ValidationErrors | null => {
        const periodsIntersect = (fa.controls as FormGroup[]).some((v, ind, arr) => {
          return arr.some(v2 =>
            (v.controls.StartDate.value < v2.controls.EndDate.value &&
              v.controls.StartDate.value > v2.controls.StartDate.value) ||
            (v.controls.EndDate.value < v2.controls.EndDate.value &&
              v.controls.EndDate.value > v2.controls.StartDate.value)
              ? true
              : false
          );
        });
        return periodsIntersect
          ? { periodsIntersect: { class: 'text-danger', value: 'Периоды не должны пересекаться!' } }
          : null;
      };

      this.form = new FormArray(
        this.currentOrder.OrderPeriods.map(op => this.createPeriodFormGroup(op)),
        [periodsIntersectValidator]
      );

      const opControlSub = this.orderPeriodsControl.valueChanges.subscribe(v => {
        this.form = new FormArray(
          v.map(op => this.createPeriodFormGroup(op)),
          [periodsIntersectValidator]
        );
      });
      this.subscriptions.push(opControlSub);

      this.loading = false;
    });
    this.subscriptions.push(dictSub);
  }

  private createPeriodFormGroup(op: OrderPeriod): FormGroup {
    return new FormGroup(
      {
        StartDate: new FormControl(op.StartDate, Validators.required),
        EndDate: new FormControl(op.EndDate, Validators.required),
        Tariff: new FormControl(
          this.tariffs.find(v => v.ID === op.TariffID),
          Validators.required
        ),
        Percent: new FormControl(op.Percent),
        OrderID: new FormControl(op.OrderID),
        Mode: new FormControl((op as any).Mode ? (op as any).Mode : 'View')
      },
      [
        (fg: FormGroup): ValidationErrors | null => {
          const invalidDateRange = fg.controls.StartDate.value > fg.controls.EndDate.value ? true : false;
          return invalidDateRange
            ? { invalidDateRange: { class: 'text-danger', value: 'Начало периода не может быть больше конца!' } }
            : null;
        }
      ]
    );
  }

  onChangeFieldValue() {
    this.orderPeriodsChange.emit(
      (this.form.controls as FormGroup[]).map(opFormGroup => {
        const op = new OrderPeriod();
        const controlNames = Object.getOwnPropertyNames(opFormGroup.controls);
        controlNames.forEach(cn => {
          if (cn === 'Tariff') {
            op.TariffID = (opFormGroup.controls[cn].value as Tariff).ID;
            op.TariffValue = (opFormGroup.controls[cn].value as Tariff).Title;
          } else {
            op[cn] = opFormGroup.controls[cn].value;
          }
        });
        return op;
      })
    );
  }

  onSavePeriod(index: number) {
    if (this.disabled) {
      return;
    }
    if ((this.form.controls[index] as FormGroup).valid && !this.form.errors?.periodsIntersect) {
      (this.form.controls[index] as FormGroup).controls.Mode.setValue('View');
      this.onChangeFieldValue();
    }
  }
  onAddPeriod() {
    const newPeriod = new OrderPeriod();
    newPeriod.StartDate =
      this.form.controls.length === 0
        ? this.currentOrder.StartDate
        : new Date(
            new Date((this.form.controls[this.form.controls.length - 1] as FormGroup).controls.EndDate.value).setDate(
              (this.form.controls[this.form.controls.length - 1] as FormGroup).controls.EndDate.value.getDate() + 1
            )
          );
    newPeriod.EndDate = new Date(newPeriod.StartDate);
    newPeriod.StartDate.setHours(0, 0, 0, 0);
    newPeriod.EndDate.setHours(0, 0, 0, 0);
    newPeriod.Percent = 0;
    (newPeriod as any).Mode = 'Edit';
    this.form.push(this.createPeriodFormGroup(newPeriod));
  }

  onDeletePeriod(index: number) {
    if (this.disabled) {
      return;
    }
    this.form.removeAt(index);
    this.onChangeFieldValue();
  }

  onEditPeriod(index: number) {
    if (this.disabled) {
      return;
    }
    (this.form.controls[index] as FormGroup).controls.Mode.setValue('Edit');
  }

  ngOnDestroy() {
    this.subscriptions.forEach(s => s.unsubscribe());
  }
}
