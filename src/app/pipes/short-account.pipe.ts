import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'shortAccount'
})
export class ShortAccountPipe implements PipeTransform {

  transform(value: unknown, ...args: unknown[]): unknown {
    if (typeof value !== 'string') return value;

    if (value.startsWith('rai_') && value.length === 64) {
      return value.substr(0, 9) + '...' + value.substr(-5);
    }

    if (value.startsWith('0x') && value.length === 42) {
      return value.substr(0, 7) + '...' + value.substr(-5);
    }

    return value;
  }
}
