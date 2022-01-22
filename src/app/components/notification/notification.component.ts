import { Component, OnInit } from '@angular/core';
import { NotificationService, Notification, NotificationType } from '../../services/notification.service';

@Component({
  selector: 'app-notification',
  templateUrl: './notification.component.html',
  styleUrls: ['./notification.component.css']
})
export class NotificationComponent implements OnInit {
  notifications: Notification[] = [];

  constructor(private notificationService: NotificationService) { }

  ngOnInit(): void {
    this.notificationService.notification$.subscribe(notification => {
      let identifier = notification.options.identifier;
      if (identifier) {
        let existing = this.notifications.find(n => {
          if (!n.options.identifier) return false;
          return n.options.identifier === identifier;
        });
        if (existing) return;
      }

      const existing = this.notifications.find(n => {
        return n.message === notification.message;
      });
      if (existing) return;

      this.notifications.push(notification);
      let timeout = notification.options.timeout;
      if (timeout) {
        setTimeout(() => this.removeNotification(notification), timeout);
      }
    });

    this.notificationService.removeNotification$.subscribe(identifier => {
      let existing = this.notifications.find(n => {
        if (!n.options.identifier) return false;
        return n.options.identifier === identifier;
      });

      if (existing) {
        this.removeNotification(existing);
      }
    });
  }

  getCssClass(type: NotificationType): string {
    switch (type) {
      case 'info': return 'uk-alert-primary';
      case 'success': return 'uk-alert-success';
      case 'warning': return 'uk-alert-warning';
      case 'error': return 'uk-alert-danger';
      default:
        return '';
    }
  }

  removeNotification(notification: Notification) {
    const existing = this.notifications.findIndex(n => n === notification);
    if (existing !== -1) {
      this.notifications.splice(existing, 1);
    }
  }

}
