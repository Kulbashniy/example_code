import { Component, OnInit } from '@angular/core';
import { fadeAnimation } from '../core/animations/animations';

@Component({
  selector: 'spa-orders',
  templateUrl: './orders.component.html',
  styleUrls: ['./orders.component.scss'],
  animations: [fadeAnimation]
})
export class OrdersComponent implements OnInit {

  constructor() { }

  ngOnInit(): void {
  }

}
