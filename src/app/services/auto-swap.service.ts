import { Injectable, OnDestroy } from '@angular/core';
import { TokenService } from './token.service';
import { SettingsService } from './settings.service';
import { ServerService, ServerState } from './server.service';
import { TranslateService } from '@ngx-translate/core';
import { marker } from '@biesbjerg/ngx-translate-extract-marker';
import { NotificationService } from './notification.service';

@Injectable({
  providedIn: 'root'
})
export class AutoSwapService implements OnDestroy {
  private timerAutoSwap: any = null;

  constructor(
    private settings: SettingsService,
    private server: ServerService,
    private translate: TranslateService,
    private notification: NotificationService,
    private token: TokenService
  ) {
    this.timerAutoSwap = setInterval(() => this.autoSwap(), 1000);
  }

  ngOnDestroy() {
    if (this.timerAutoSwap) {
      clearInterval(this.timerAutoSwap);
      this.timerAutoSwap = null;
    }
  }

  autoSwap() {
    if (this.server.getState() !== ServerState.CONNECTED) return;

    this.token
    // todo:
  }

}
