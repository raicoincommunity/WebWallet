import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

export type NotificationType = 'info' | 'success' | 'warning' | 'error';

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private notificationSubject = new Subject<Notification>();
  private removeSubject = new Subject<string>();
  private readonly defaultTimeout = 5 * 1000;

  notification$ = this.notificationSubject.asObservable();
  removeNotification$ = this.removeSubject.asObservable();

  constructor() { }

  send(type: NotificationType, message: string, options: any = {}) {
    if (!options.timeout) {
      options.timeout = this.defaultTimeout;
    }
    this.notificationSubject.next({ type, message, options });
  }

  remove(identifier: string) {
    this.removeSubject.next(identifier);
  }

  sendInfo(message:string, options = {}) {
    this.send('info', message, options);
  }

  sendSuccess(message:string, options = {}) {
    this.send('success', message, options);
  }

  sendWarning(message:string, options = {}) {
    this.send('warning', message, options);
  }

  sendError(message:string, options = {}) {
    this.send('error', message, options);
  }

}

export interface Notification {
  type: NotificationType;
  message: string;
  options: any;
}

export enum NotificationId {
  BSC_TXN_SENT = 'bsc_txn_sent',
  BSC_SINGING_SENT = 'bsc_signing_sent',
}

