import { Component, OnInit, Input } from '@angular/core';
import {ActivatedRoute, Router} from "@angular/router";
import { WalletsService, WalletErrorCode } from '../../services/wallets.service';
import { NotificationService } from '../../services/notification.service';
import { TranslateService } from '@ngx-translate/core';
import { marker } from '@biesbjerg/ngx-translate-extract-marker';

@Component({
  selector: 'app-configure-wallet',
  templateUrl: './configure-wallet.component.html',
  styleUrls: ['./configure-wallet.component.css']
})
export class ConfigureWalletComponent implements OnInit {
  activePanel = 0;
  newSeed = '';

  importSeedModel = '';
  walletPasswordModel = '';
  walletPasswordConfirmModel = '';


  selectedImportOption = ImportOption.SEED;
  importOptions = [
    { name: 'Raicoin Seed', value: ImportOption.SEED },
  ];

  newWalletId = '';
  newWalletIndex = 0;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private translate: TranslateService,
    private wallets: WalletsService,
    private notification: NotificationService) {
  }

  ngOnInit(): void {
    const toggleImport = this.route.snapshot.queryParams.import;
    if (toggleImport) {
      this.activePanel = 1;
    }
  }

  setPanel(panel: number) {
    this.activePanel = panel;
  }

  createWallet() {
    let result = this.wallets.createWallet();
    if (result.errorCode !== WalletErrorCode.SUCCESS || !result.seed || !result.walletId || !result.walletIndex) {
      let msg = marker('Failed to create new wallet');
      this.translate.get(msg).subscribe(res => msg = res);
      this.notification.sendError(msg);
      return;
    }
    this.newSeed = result.seed;
    this.newWalletId = result.walletId;
    this.newWalletIndex = result.walletIndex;

    this.activePanel = 3;
    let msg = marker(`Successfully created new wallet! Make sure to write down your seed!`);
    this.translate.get(msg).subscribe(res => msg = res);
    this.notification.sendSuccess(msg);
  }

  importWallet() {
    let seed = '';
    if (this.selectedImportOption === ImportOption.SEED) {
      if (!/^[0-9A-Fa-f]{64}$/.test(this.importSeedModel)) {
        let msg = marker('Seed is invalid, double check it!');
        this.translate.get(msg).subscribe(res => msg = res);
        this.notification.sendError(msg);
        return;
      }
      seed = this.importSeedModel;
    }

    let result = this.wallets.createWallet('', seed);
    if (result.errorCode !== WalletErrorCode.SUCCESS || !result.walletIndex || !result.walletId) {
      let msg = marker(`Unexpected error while importing wallet!`);
      this.translate.get(msg).subscribe(res => msg = res);    
      this.notification.sendError(msg, { timeout: 0 });
      return;
    }
    
    this.newWalletId = result.walletId;
    this.newWalletIndex = result.walletIndex;
    this.activePanel = 4;
    this.importSeedModel = '';
    let msg = marker(`Successfully imported wallet!`);
    this.translate.get(msg).subscribe(res => msg = res);
    this.notification.sendSuccess(msg);
  }

  confirmNewSeed() {
    this.newSeed = '';
    this.activePanel = 4;
  }

  copied() {
    let msg = marker(`Wallet seed copied to clipboard!`);
    this.translate.get(msg).subscribe(res => msg = res);
    this.notification.sendSuccess(msg);
  }

  saveWalletPassword() {
    if (this.walletPasswordConfirmModel !== this.walletPasswordModel) {
      let msg = marker(`Password confirmation does not match, try again!`);
      this.translate.get(msg).subscribe(res => msg = res);      
      return this.notification.sendError(msg);
    }

    if (this.walletPasswordModel.length < 1) {
      let msg = marker(`Password cannot be empty!`);
      this.translate.get(msg).subscribe(res => msg = res);      
      return this.notification.sendWarning(msg);
    }

    let password = this.walletPasswordModel;
    let result = this.wallets.setWalletPassword(this.newWalletId, password);
    if (result.errorCode === WalletErrorCode.SUCCESS) {
      this.walletPasswordModel = '';
      this.walletPasswordConfirmModel = '';
      this.activePanel = 5;
      this.newWalletId = '';
      let msg = marker(`Successfully set wallet password!`);
      this.translate.get(msg).subscribe(res => msg = res);
      this.notification.sendSuccess(msg);
    }
    else if (result.errorCode === WalletErrorCode.MISS) {
      let msg = marker(`The wallet has already been deleted!`);
      this.translate.get(msg).subscribe(res => msg = res);
      this.notification.sendWarning(msg);
      this.router.navigate(['']);
    }
    else if (result.errorCode === WalletErrorCode.LOCKED) {
      let msg = marker(`The wallet is locked.`);
      this.translate.get(msg).subscribe(res => msg = res);
      this.notification.sendError(msg);
      this.router.navigate(['']);
    }
    else {
    }
  }

}

enum ImportOption {
  SEED = 'seed'
}