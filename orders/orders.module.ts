import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { DialogModule } from '@progress/kendo-angular-dialog';
import { ExcelModule, GridModule } from '@progress/kendo-angular-grid';
import { CardModule, SplitterModule, TabStripModule } from '@progress/kendo-angular-layout';
import { TextAreaModule } from '@progress/kendo-angular-inputs';
import { DatePickerModule } from '@progress/kendo-angular-dateinputs';
import { MultiSelectModule } from '@progress/kendo-angular-dropdowns';
import { ButtonsModule } from '@progress/kendo-angular-buttons';
import { TooltipModule } from '@progress/kendo-angular-tooltip';
import { ChatModule } from '@progress/kendo-angular-conversational-ui';
import { LoaderModule } from "@progress/kendo-angular-indicators";

import { SharedModule } from '../shared/shared.module';
import { OrdersRoutingModule } from './orders-routing.module';

import { OrdersComponent } from './orders.component';
import { OrdersGridComponent } from './orders-grid/orders-grid.component';
import { OrdersNewComponent } from './orders-new/orders-new.component';
import { ViewEditOrderDialogComponent } from './shared/view-edit-order-dialog/view-edit-order-dialog.component';
import { NewOrderDialogComponent } from './shared/new-order-dialog/new-order-dialog.component';
import { OrderLibModule } from 'order-lib';
import { OrdersOrderManagementComponent } from './orders-order-management/orders-order-management.component';
import { OrderCalculateDialogComponent } from './shared/order-calculate-dialog/order-calculate-dialog.component';
import { OrdersResourceGridComponent } from './orders-order-management/orders-resource-grid/orders-resource-grid.component';
import { CloseOrdertaskDialogComponent } from './shared/close-ordertask-dialog/close-ordertask-dialog.component';
import { OrdersIncomeGridComponent } from './orders-grid/orders-income-grid/orders-income-grid.component';
import { OrdersLossGridComponent } from './orders-grid/orders-loss-grid/orders-loss-grid.component';
import { OrdersGridBindingDirective } from './directives/orders-grid-binding.directive';

@NgModule({
  declarations: [
    OrdersComponent,
    OrdersGridComponent,
    OrdersNewComponent,
    ViewEditOrderDialogComponent,
    NewOrderDialogComponent,
    OrdersOrderManagementComponent,
    OrderCalculateDialogComponent,
    OrdersResourceGridComponent,
    CloseOrdertaskDialogComponent,
    OrdersIncomeGridComponent,
    OrdersLossGridComponent,
    OrdersGridBindingDirective
  ],
  imports: [
    CommonModule,
    FormsModule,
    OrdersRoutingModule,
    DialogModule,
    GridModule,
    ExcelModule,
    CardModule,
    ChatModule,
    LoaderModule,
    TooltipModule,
    TabStripModule,
    SplitterModule,
    TextAreaModule,
    DatePickerModule,
    MultiSelectModule,
    ButtonsModule,
    SharedModule,
    OrderLibModule
  ]
})
export class OrdersModule {}
