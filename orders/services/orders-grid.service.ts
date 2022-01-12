import { Injectable } from '@angular/core';
import { GridDataResult } from '@progress/kendo-angular-grid';
import { State } from '@progress/kendo-data-query';
import * as CamlBuilder from 'camljs';
import { forkJoin, from, range } from 'rxjs';
import { concatMap, last, map } from 'rxjs/operators';
import { executeSpContex, itemsToArray, Order, OrderRelate } from 'shared-lib';
import { GridService } from '../../shared/models/GridService';

@Injectable()
export class OrdersGridService extends GridService<Order> {
  constructor() {
    super(Order);
  }

  public query(state: State, orderType: 'Доходный' | 'Расходный') {
    const stateChanges = this.checkChangeState(state);
    if (stateChanges.filterChange || stateChanges.takeChange || stateChanges.sortChange) {
      state.skip = 0; // сбрасываем на первую страницу
      this.pageData = []; // сбрасываем загруженные данные
      this.generateCamlQuery(state, orderType);
      // если изменились фильтры, то кроме данных мы должны запросить новое кол-во элементов соответсвующее запросу
      if (stateChanges.filterChange) {
        forkJoin([this.getItemsCount(), this.getNextPage()])
          .pipe(
            concatMap(data =>
              from(this.getOrderRelates(data[1].map(o => o.ID))).pipe(
                map(relates => {
                  this.setOrderRelates(data[1], relates);
                  return { itemsCount: data[0], orders: data[1], relates };
                })
              )
            )
          )
          .subscribe(() => super.next({ data: this.pageData[0], total: this.itemsCount } as GridDataResult));
      } else {
        from(this.getNextPage())
          .pipe(
            concatMap(orders =>
              from(this.getOrderRelates(orders.map(o => o.ID))).pipe(
                map(relates => {
                  this.setOrderRelates(orders, relates);
                  return { orders, relates };
                })
              )
            )
          )
          .subscribe(() => super.next({ data: this.pageData[0], total: this.itemsCount } as GridDataResult));
      }
    } else if (stateChanges.skipChange) {
      const requestedPage = state.skip / state.take;
      const loadedPageCount = this.pageData.length;
      if (loadedPageCount >= requestedPage + 1) {
        super.next({ data: this.pageData[requestedPage], total: this.itemsCount } as GridDataResult);
      } else {
        range(0, requestedPage + 1 - loadedPageCount)
          .pipe(
            concatMap(() => this.getNextPage()),
            concatMap(orders =>
              from(this.getOrderRelates(orders.map(v => v.ID))).pipe(
                map(relates => {
                  this.setOrderRelates(orders, relates);
                  return { orders, relates };
                })
              )
            ),
            last()
          )
          .subscribe(() => {
            super.next({ data: this.pageData[requestedPage], total: this.itemsCount } as GridDataResult);
          });
      }
    }

    this.state = Object.assign({}, state);
  }

  private setOrderRelates(orders: Order[], relates: OrderRelate[]): void {
    orders.forEach(o => {
      o.RelatedOrders = relates
        .filter(r => r.OrderID === o.ID && r.RelateOrderID)
        .map(l => {
          return { id: l.RelateOrderID, value: l.RelateOrderValue };
        });
      o.RelatedProducts = relates
        .filter(r => r.OrderID === o.ID && r.RelateProductID)
        .map(l => {
          return { id: l.RelateProductID, value: l.RelateProductValue };
        });
    });
  }

  /** Генерирует this.camlQuery и this.camlQueryWithoutPaging согласно переданным state и orderType */
  protected generateCamlQuery(state: State, orderType: 'Доходный' | 'Расходный'): void {
    let filterExpression = this.createFilterExpression(state);
    const tempQuery = new CamlBuilder()
      .View()
      .RowLimit(state.take, true)
      .Query()
      .Where()
      .ChoiceField('OrderClassification')
      .EqualTo(orderType);
    if (filterExpression?.length) {
      tempQuery.And().All(filterExpression);
    }
    state.sort?.forEach((s, ind) => {
      if (ind === 0) {
        if (s.dir == 'asc') {
          tempQuery.OrderBy(this.fieldNameToSpFieldName(s.field));
        } else if (s.dir == 'desc') {
          tempQuery.OrderByDesc(this.fieldNameToSpFieldName(s.field));
        }
        return;
      }

      if (s.dir == 'asc') {
        ((tempQuery as any) as CamlBuilder.ISortedQuery).ThenBy(this.fieldNameToSpFieldName(s.field));
      } else if (s.dir == 'desc') {
        ((tempQuery as any) as CamlBuilder.ISortedQuery).ThenByDesc(this.fieldNameToSpFieldName(s.field));
      }
    });
    this.camlQuery = tempQuery.ToCamlQuery();
    filterExpression = this.createFilterExpression(state);
    const tempWPQuery = new CamlBuilder()
      .View(['ID'])
      .Query()
      .Where()
      .ChoiceField('OrderClassification')
      .EqualTo(orderType);
    if (filterExpression?.length) {
      tempWPQuery.And().All(filterExpression);
    }
    this.camlQueryWithoutPaging = tempWPQuery.ToCamlQuery();
  }

  protected fieldNameToSpFieldName(fieldName: string): string {
    switch (fieldName) {
      case 'ChargeCode':
        return 'OrderChargeCode';
      case 'StartDate':
        return 'OrderStartDate';
      case 'EndDate':
        return 'OrderEndDate';
      case 'Number':
        return 'OrderNumber';
      case 'Transcript':
        return 'OrderTranscript';
      case 'ContractID':
        return 'OrderContract';
      case 'ContractValue':
        return 'OrderContract';
      case 'ResponsibleUserID':
        return 'OrderResponsibleUser';
      case 'ResponsibleUserValue':
        return 'OrderResponsibleUser';
      case 'Status':
        return 'OrderStatus';
      case 'StatusState':
        return 'OrderStatusState';
      case 'Services':
        return 'OrderServiceRc';
      case 'ServicesIds':
        return 'OrderServiceRc';
      case 'AllowTimeSheets':
        return 'OrderAllowTimeSheets';
      case 'Type':
        return 'OrderType';
      case 'TerminationDatePlan':
        return 'OrderTerminationDatePlan';
      case 'CompanyID':
        return 'OrderCompany';
      case 'Hashtags':
        return 'OrderHashtags';
      case 'HashtagsIds':
        return 'OrderHashtags';
      case 'ProductID':
        return 'OrderProduct';
      case 'ProductValue':
        return 'OrderProduct';
      case 'ContactID':
        return 'OrderContact';
      case 'ContactValue':
        return 'OrderContact';
      case 'TariffChange':
        return 'OrderTariffChange';
      case 'ConfinementProbability':
        return 'OrderConfinementProbability';
      case 'Income':
        return 'OrderRevenue';
      case 'Loss':
        return 'OrderCosts';
      case 'IsArchive':
        return 'OrderIsArchive';
      case 'ExpenseType':
        return 'OrderExpenseType';
      case 'SigningDate':
        return 'OrderSigningDate';
      case 'ProvisionServiceDatePlan':
        return 'OrderProvisionServiceDatePlan';
      case 'Classification':
        return 'OrderClassification';
      case 'ProvisionServiceDateFact':
        return 'OrderProvisionServiceDateFact';
      case 'FactSigningDate':
        return 'OrderFactSigningDate';
      case 'PlanSigningDate':
        return 'OrderPlanSigningDate';
      case 'NumberByContract':
        return 'OrderNumberByContract';
      default:
        return fieldName;
    }
  }

  protected createExpression(spFieldName: string, value: any, operator?: string | Function): CamlBuilder.IExpression {
    if (
      [
        'OrderStartDate',
        'OrderEndDate',
        'OrderSigningDate',
        'OrderProvisionServiceDatePlan',
        'OrderProvisionServiceDateFact',
        'OrderFactSigningDate',
        'OrderPlanSigningDate'
      ].includes(spFieldName)
    ) {
      const res = CamlBuilder.Expression().DateField(spFieldName);
      if (typeof operator === 'string') {
        switch (operator) {
          case 'neq':
            res.NotEqualTo(value);
            break;
          case 'lt':
            res.LessThan(value);
            break;
          case 'lte':
            res.LessThanOrEqualTo(value);
            break;
          case 'gt':
            res.GreaterThan(value);
            break;
          case 'gte':
            res.GreaterThanOrEqualTo(value);
            break;
          default:
            res.EqualTo(value);
            break;
        }
      } else {
        res.EqualTo(value);
      }
      return res as any;
    } else if (
      ['OrderNumberByContract', 'Title', 'OrderChargeCode', 'OrderNumber', 'OrderTranscript'].includes(spFieldName)
    ) {
      return CamlBuilder.Expression()
        .TextField(spFieldName)
        .EqualTo(value);
    } else if (['OrderIsArchive', 'OrderAllowTimeSheets', 'OrderTariffChange'].includes(spFieldName)) {
      return CamlBuilder.Expression()
        .BooleanField(spFieldName)
        .EqualTo(value);
    } else if (['OrderStatus', 'OrderStatusState', 'OrderType', 'OrderExpenseType'].includes(spFieldName)) {
      return CamlBuilder.Expression()
        .ChoiceField(spFieldName)
        .EqualTo(value);
    } else if (['OrderConfinementProbability', 'OrderRevenue', 'OrderCosts'].includes(spFieldName)) {
      const res = CamlBuilder.Expression().NumberField(spFieldName);
      if (typeof operator === 'string') {
        switch (operator) {
          case 'neq':
            res.NotEqualTo(value);
            break;
          case 'lt':
            res.LessThan(value);
            break;
          case 'lte':
            res.LessThanOrEqualTo(value);
            break;
          case 'gt':
            res.GreaterThan(value);
            break;
          case 'gte':
            res.GreaterThanOrEqualTo(value);
            break;
          default:
            res.EqualTo(value);
            break;
        }
      } else {
        res.EqualTo(value);
      }
      return res as any;
    } else if (
      ['OrderContact', 'OrderProduct', 'OrderCompany', 'OrderResponsibleUser', 'OrderContract'].includes(spFieldName)
    ) {
      return CamlBuilder.Expression()
        .LookupField(spFieldName)
        .ValueAsText()
        .EqualTo(value);
    } else if (['OrderHashtags', 'OrderServiceRc'].includes(spFieldName)) {
      return CamlBuilder.Expression()
        .LookupMultiField(spFieldName)
        .IncludesSuchItemThat()
        .ValueAsText()
        .EqualTo(value);
    }
  }

  private getOrderRelates(ids: number[]): Promise<OrderRelate[]> {
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
}
