import { Pipe, PipeTransform } from '@angular/core';
import { Nameable, displayName } from '../core/utils/display-name.util';

/** `{{ row | displayName }}` — the template-usable form of displayName(), for the handful of admin tables and NAP's ballot list that used to just print `row.email`. */
@Pipe({ name: 'displayName' })
export class DisplayNamePipe implements PipeTransform {
  transform(person: Nameable | null | undefined): string {
    return displayName(person);
  }
}
