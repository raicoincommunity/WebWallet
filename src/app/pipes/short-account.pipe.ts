import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'shortAccount'
})
export class ShortAccountPipe implements PipeTransform {

  transform(value: unknown, ...args: unknown[]): unknown {
    if (typeof value !== 'string' || value.length !== 64) return value;
    return value.substr(0, 8) + '...' + value.substr(-4);
  }
}
