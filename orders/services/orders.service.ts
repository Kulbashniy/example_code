import { Injectable } from '@angular/core';
import * as CamlBuilder from 'camljs';
import { executeSpContex, itemsToArray, Order, OrderRelate } from 'shared-lib';
import { Department } from '../../shared/models/Department';
import { OrderMessage } from '../../shared/models/OrderMessage';
import { OrderTask } from '../../shared/models/OrderTask';
import { Substitute } from '../../shared/models/Substitute';
import { ILookupObj } from '../../shared/SPUtils';

@Injectable({
  providedIn: 'root'
})
export class OrdersService {
  private departmentsListUrl = 'Lists/departments';

  constructor() {
    //
  }

  /** Запрашивает и возвращает все заказы */
  getAllOrders(): Promise<Order[]> {
    const promise = new Promise<Order[]>((resolve, reject) => {
      executeSpContex((ctx, web) => {
        const list = web.getList(_spPageContextInfo.webServerRelativeUrl + Order.ListUrl);
        const items = list.getItems(SP.CamlQuery.createAllItemsQuery());
        ctx.load(items);
        ctx.executeQueryAsync(
          () => {
            resolve(itemsToArray(items, item => new Order(item)));
          },
          (sender, args) => {
            const msg = `Не удалось получить все заказы!`;
            console.log(msg, args.get_message());
            reject(msg);
          }
        );
      });
    });
    return promise;
  }

  /** Запрашивает и возвращает все доходные заказы */
  getAllIncomeOrders(): Promise<Order[]> {
    const promise = new Promise<Order[]>((resolve, reject) => {
      executeSpContex((ctx, web) => {
        const list = web.getList(_spPageContextInfo.webServerRelativeUrl + Order.ListUrl);
        const qy = new CamlBuilder()
          .View()
          .Query()
          .Where()
          .ChoiceField('OrderClassification')
          .EqualTo(Order.OrderClassifications.Income)
          .ToCamlQuery();
        const items = list.getItems(qy);
        ctx.load(items);
        ctx.executeQueryAsync(
          () => {
            resolve(itemsToArray(items, item => new Order(item)));
          },
          (sender, args) => {
            const msg = `Не удалось получить все доходные заказы!`;
            console.log(msg, args.get_message());
            reject(msg);
          }
        );
      });
    });
    return promise;
  }

  /** Запрашивает и возвращает все расходные заказы */
  getAllLossOrders(): Promise<Order[]> {
    const promise = new Promise<Order[]>((resolve, reject) => {
      executeSpContex((ctx, web) => {
        const list = web.getList(_spPageContextInfo.webServerRelativeUrl + Order.ListUrl);
        const qy = new CamlBuilder()
          .View()
          .Query()
          .Where()
          .ChoiceField('OrderClassification')
          .EqualTo(Order.OrderClassifications.Loss)
          .ToCamlQuery();
        const items = list.getItems(qy);
        ctx.load(items);
        ctx.executeQueryAsync(
          () => {
            resolve(itemsToArray(items, item => new Order(item)));
          },
          (sender, args) => {
            const msg = `Не удалось получить все расходные заказы!`;
            console.log(msg, args.get_message());
            reject(msg);
          }
        );
      });
    });
    return promise;
  }

  getAllDepartments(): Promise<ILookupObj[]> {
    const promise = new Promise<ILookupObj[]>((resolve, reject) => {
      executeSpContex((ctx, web) => {
        const list = web.getList(_spPageContextInfo.webServerRelativeUrl + this.departmentsListUrl);
        const items = list.getItems(SP.CamlQuery.createAllItemsQuery());
        ctx.load(items, 'Include(Id, Title)');
        ctx.executeQueryAsync(
          () => {
            resolve(itemsToArray(items, item => ({ id: item.get_id(), value: item.get_item('Title') } as ILookupObj)));
          },
          (sender, args) => {
            const msg = `Не удалось получить все подразделения!`;
            console.log(msg, args.get_message());
            reject(msg);
          }
        );
      });
    });
    return promise;
  }

  getAllDepartmentsAsDep(): Promise<Department[]> {
    const promise = new Promise<Department[]>((resolve, reject) => {
      executeSpContex((ctx, web) => {
        const list = web.getList(_spPageContextInfo.webServerRelativeUrl + this.departmentsListUrl);
        const items = list.getItems(SP.CamlQuery.createAllItemsQuery());
        ctx.load(items);
        ctx.executeQueryAsync(
          () => {
            const result = itemsToArray(items, item => new Department(item));
            resolve(result);
          },
          (sender, args) => {
            const msg = `Не удалось получить все подразделения!`;
            console.log(msg, args.get_message());
            reject(msg);
          }
        );
      });
    });
    return promise;
  }

  getOrderTasksByOrderId(orderId: number): Promise<OrderTask[]> {
    const promise = new Promise<OrderTask[]>((resolve, reject) => {
      executeSpContex((ctx, web) => {
        const list = web.getList(_spPageContextInfo.webServerRelativeUrl + OrderTask.ListUrl);
        const qy = new CamlBuilder()
          .View()
          .Query()
          .Where()
          .LookupField('OrderTaskOrder')
          .Id()
          .EqualTo(orderId)
          .ToCamlQuery();
        const items = list.getItems(qy);
        ctx.load(items);
        ctx.executeQueryAsync(
          () => {
            const result = itemsToArray(items, item => new OrderTask(item));
            resolve(result);
          },
          (sender, args) => {
            const msg = `Не удалось получить задачи для заказа!`;
            console.log(`${msg} C ID - ${orderId}.`, args.get_message());
            reject(msg);
          }
        );
      });
    });
    return promise;
  }

  /** Проверяет наличие текущего пользователя в переданной группе. */
  public checkUserExistInSpGroup(groupId: number): Promise<boolean> {
    const result = new Promise<boolean>((resolve, reject) => {
      executeSpContex((ctx, web) => {
        const group = web
          .get_siteGroups()
          .getById(groupId)
          .get_users();
        ctx.load(group);
        ctx.executeQueryAsync(
          () => {
            let userIsExist = false;
            const enumGroup = group.getEnumerator();
            while (enumGroup.moveNext()) {
              if (enumGroup.get_current().get_id() === _spPageContextInfo.userId) {
                userIsExist = true;
              }
            }
            resolve(userIsExist);
          },
          (sender, args) => {
            const msg = `Не удалось проверить права пользователя!`;
            console.log(msg, args.get_message());
            reject(msg);
          }
        );
      });
    });
    return result;
  }

  public getOrderMessages(orderId: number): Promise<OrderMessage[]> {
    const promise = new Promise<OrderMessage[]>((resolve, reject) => {
      executeSpContex((ctx, web) => {
        const list = web.getList(_spPageContextInfo.webServerRelativeUrl + OrderMessage.ListUrl);
        const qy = new CamlBuilder()
          .View()
          .Query()
          .Where()
          .LookupField('OrderMessageOrder')
          .Id()
          .EqualTo(orderId)
          .ToCamlQuery();
        const items = list.getItems(qy);
        ctx.load(items);
        ctx.executeQueryAsync(
          () => {
            const result = itemsToArray(items, item => new OrderMessage(item));
            resolve(result);
          },
          (sender, args) => {
            const msg = `Не удалось загрузить сообщения заказа!`;
            console.log(msg, args.get_message());
            reject(msg);
          }
        );
      });
    });
    return promise;
  }
  getOrderRelates(ids: number[]): Promise<OrderRelate[]> {
    const promise = new Promise<OrderRelate[]>((resolve, reject) => {
      if (!ids.length) {
        resolve([]);
        return;
      }
      executeSpContex((ctx, web) => {
        const list = web.getList(_spPageContextInfo.webServerRelativeUrl + OrderRelate.ListUrl);
        const items = list.getItems(
          new CamlBuilder()
            .View(OrderRelate.ViewFields)
            .Query()
            .Where()
            .LookupField('OrderRelateOrder')
            .Id()
            .In(ids)
            .ToCamlQuery()
        );
        ctx.load(items);
        ctx.executeQueryAsync(
          () => {
            resolve(itemsToArray(items, item => new OrderRelate(item)));
          },
          (sender, args) => {
            const msg = `Не удалось получить связанные заказы!`;
            console.log(msg, args.get_message());
            reject(msg);
          }
        );
      });
    });
    return promise;
  }

  /** Запрашивает и возвращает замещения где текущий сотрудник/пользователь является замещающим(кого-то замещает) */
  public getSubstitutes(): Promise<Substitute[]> {
    const promise = new Promise<Substitute[]>((resolve, reject) => {
      executeSpContex((ctx, web) => {
        const list = web.getList(_spPageContextInfo.webServerRelativeUrl + Substitute.ListUrl);
        const substitutesQuery = new CamlBuilder()
          .View(Substitute.LoadedFields)
          .Query()
          .Where()
          .DateField('SubstituteStartDate')
          .LessThanOrEqualTo(`${new Date().format('yyyy-MM-dd')}T12:00:00Z`)
          .And()
          .DateField('SubstituteEndDate')
          .GreaterThanOrEqualTo(`${new Date().format('yyyy-MM-dd')}T12:00:00Z`)
          .And()
          .UserField('SubstituteEmployee')
          .EqualToCurrentUser()
          .ToCamlQuery();
        const items = list.getItems(substitutesQuery);
        ctx.load(items);
        ctx.executeQueryAsync(
          () => {
            const result = itemsToArray(items, item => new Substitute(item));
            resolve(result);
          },
          (sender, args) => {
            const msg = `Не удалось проверить наличие замещений сотрудников!`;
            console.log(msg, args.get_message());
            reject(msg);
          }
        );
      });
    });
    return promise;
  }
}
