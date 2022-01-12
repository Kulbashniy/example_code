import { AfterViewInit, Component, OnInit } from '@angular/core';
import { GridsConfig } from '../../shared/static';
import { setHeightForGrid } from '../../shared/Utils';

@Component({
  selector: 'spa-orders-grid',
  templateUrl: './orders-grid.component.html',
  styleUrls: ['./orders-grid.component.scss']
})
export class OrdersGridComponent implements OnInit, AfterViewInit {
  constructor() {
  }

  ngOnInit(): void {
  }

  ngAfterViewInit(): void {
    const config = GridsConfig.orders;
    if (config) {
      setHeightForGrid(config.selector, config.topPadding);
    }
  }
}
