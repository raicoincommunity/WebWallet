import { Pipe, PipeTransform } from '@angular/core';
import { U128, U8 } from '../services/util.service';
import { Amount } from '../services/wallets.service';

@Pipe({
  name: 'balance'
})
export class BalancePipe implements PipeTransform {

  transform(value: Amount | U128, decimals: number = 9): unknown {
    if (decimals < 0) decimals = 0;
    if (decimals > 9) decimals = 9;
    decimals |= 0;

    if (value instanceof U128) value = { negative: false, value };

    if (!value.negative && value.value.gt(0) && value.value.lt(10 ** (9 - decimals))) {
      let result = '1 RAI';
      for (let i = decimals; i > 1 ; --i) {
        result = '0' + result;
      }
      if (decimals > 0) result = '0.' + result;
      return '<' + result;
    }

    let result = value.value.toBalanceStr(U128.RAI(), new U8(decimals));
    if (value.negative) {
      result = '-' + result;
    }

    result += ' RAI';

    return result;
  }

}
