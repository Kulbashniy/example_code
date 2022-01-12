import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { DialogCloseResult, DialogRef, DialogService } from '@progress/kendo-angular-dialog';

@Component({
  selector: 'spa-orders-new',
  templateUrl: './orders-new.component.html',
  styleUrls: ['./orders-new.component.scss']
})
export class OrdersNewComponent implements OnInit {
  constructor(private dialogService: DialogService, private router: Router) {}

  ngOnInit(): void {}

  public onSaveAction() {
    this.showConfirmation();
  }
  public onCancelAction() {
    this.goToOrdersGrid();
  }

  private showConfirmation() {
    const dialog: DialogRef = this.dialogService.open({
      title: 'Заказ сохранен',
      content: 'Вы хотите перейти на страницу с таблицей заказов?',
      actions: [{ text: 'Нет' }, { text: 'Да', primary: true }],
      width: 450,
      height: 180,
      minWidth: 250
    });

    dialog.result.toPromise().then(result => {
      if (result instanceof DialogCloseResult) {
        return;
      } else {
        this.goToOrdersGrid();
      }
    });
  }

  /** Переход на страницу с гридом заказов */
  private goToOrdersGrid() {
    this.router.navigateByUrl('/orders/grid');
  }
}
