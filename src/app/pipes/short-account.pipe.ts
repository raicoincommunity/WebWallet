import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'shortAccount'
})
export class ShortAccountPipe implements PipeTransform {

  transform(value: unknown, len: number = 5, ...args: unknown[]): unknown {
    if (typeof value !== 'string') return value;

    if (len > 32) {
      len = 32;
    }

    if (len < 4) {
      len = 4;
    }

    if (value.startsWith('rai_') && value.length === 64) {
      return value.substr(0, 4 + len) + '...' + value.substr(-len);
    }

    if (value.startsWith('0x') && value.length === 42) {
      return value.substr(0, 2 + len) + '...' + value.substr(-len);
    }

    return value;
  }
}
