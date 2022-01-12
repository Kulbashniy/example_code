import { Component, OnInit, Input } from '@angular/core';
import { Order } from '../../../models/Order';

@Component({
  selector: 'or-lib-create-edit-block-info',
  templateUrl: './create-edit-block-info.component.html',
  styleUrls: ['./create-edit-block-info.component.scss']
})
export class CreateEditBlockInfoComponent implements OnInit {
  @Input() object: Order;
  constructor() {}

  ngOnInit() {}
}
