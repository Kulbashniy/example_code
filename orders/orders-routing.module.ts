import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { OrdersGridComponent } from './orders-grid/orders-grid.component';
import { OrdersNewComponent } from './orders-new/orders-new.component';
import { OrdersOrderManagementComponent } from './orders-order-management/orders-order-management.component';
import { OrdersComponent } from './orders.component';

const routes: Routes = [
  {
    path: '',
    component: OrdersComponent,
    children: [
      { path: 'grid', component: OrdersGridComponent },
      { path: 'new', component: OrdersNewComponent },
      {
        path: 'order-management/:orderId',
        component: OrdersOrderManagementComponent,
        data: { navText: 'Управление заказом' }
      },
      { path: '', redirectTo: '/orders/grid', pathMatch: 'full' }
    ]
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class OrdersRoutingModule { }
