import { Directive, Input, OnDestroy, OnInit } from '@angular/core';
import { DataBindingDirective, GridComponent } from '@progress/kendo-angular-grid';
import { Subscription } from 'rxjs';
import { OrdersGridService } from '../services/orders-grid.service';

@Directive({
  selector: '[ordersGridBinding]',
  providers: [OrdersGridService]
})
export class OrdersGridBindingDirective extends DataBindingDirective implements OnInit, OnDestroy {
  /** Классификация/тип заказов (расходный | доходный) см. Order.OrderClassifications */
  @Input() ordersType: 'Расходный' | 'Доходный';

  private subscriptions: Subscription[] = [];

  constructor(protected grid: GridComponent, private gridService: OrdersGridService) {
    super(grid);
  }

  ngOnInit(): void {
    SP.SOD.executeFunc('sp.js', 'SP.ClientContext', () => {
      const orderSub = this.gridService.subscribe(result => {
        this.grid.loading = false;
        this.grid.data = result;
        this.applyState(this.state);
        this.notifyDataChange();
      });
      this.subscriptions.push(orderSub);

      super.ngOnInit();
      this.rebind();
    });
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    super.ngOnDestroy();
  }

  public rebind(): void {
    this.grid.loading = true;

    this.gridService.query(this.state, this.ordersType);
  }
}
