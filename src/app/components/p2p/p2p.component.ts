import { Component, OnInit, ViewChild } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { marker } from '@biesbjerg/ngx-translate-extract-marker';
import { U256 } from '../../services/util.service';
import { TokenWidgetComponent } from '../token-widget/token-widget.component';
import { NotificationService } from '../../services/notification.service';

@Component({
  selector: 'app-p2p',
  templateUrl: './p2p.component.html',
  styleUrls: ['./p2p.component.css']
})
export class P2pComponent implements OnInit {
  @ViewChild('fromTokenWidget') fromTokenWidget! : TokenWidgetComponent;
  @ViewChild('toTokenWidget') toTokenWidget! : TokenWidgetComponent;


  activePanel = '';
  selectedSearchBy = SearchByOption.PAIR;
  inputSearchOrderId = '';


  constructor(
    private notification: NotificationService,
    private translate: TranslateService
  ) { }

  ngOnInit(): void {
  }

  searchByOptions(): string[] {
    return ['id', 'pair'];
  }

  showSearchByOption(option: string): string {
    if (option === SearchByOption.ID) {
      let msg = marker(`Order ID`);
      this.translate.get(msg).subscribe(res => msg = res);
      return msg;
    } else if (option == SearchByOption.PAIR) {
      let msg = marker(`Trading Pair`);
      this.translate.get(msg).subscribe(res => msg = res);
      return msg;
    } else {
      return '';
    }
  }

  searchOrderIdStatus(): number {
    if (this.inputSearchOrderId === '') {
      return 0;
    }

    try {
      if (this.inputSearchOrderId.length != 64) {
        return 2;
      }

      const hash = new U256(this.inputSearchOrderId, 16);
      return 1; 
    } catch (err) {
      return 2;
    }
  }


  search() {
    if (!this.fromTokenWidget || !this.fromTokenWidget.selectedToken
        || !this.toTokenWidget || !this.toTokenWidget.selectedToken) {
      let msg = marker(`Please input the token pair`);
      this.translate.get(msg).subscribe(res => msg = res);
      this.notification.sendError(msg);
      return;
    }

    const fromToken = this.fromTokenWidget.selectedToken;
    const toToken = this.toTokenWidget.selectedToken;
    if (fromToken.chain === toToken.chain && fromToken.address === toToken.address)
    {
      let msg = marker(`Invalid token pair`);
      this.translate.get(msg).subscribe(res => msg = res);
      this.notification.sendError(msg);
      return;
    }

    
    // todo:
  }

}


enum SearchByOption {
  ID = 'id',
  PAIR = 'pair',
}