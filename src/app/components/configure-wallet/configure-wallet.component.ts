import { Component, OnInit, Input } from '@angular/core';
import {ActivatedRoute, Router} from "@angular/router";
import { WalletsService, WalletErrorCode } from '../../services/wallets.service';
import { NotificationService } from '../../services/notification.service';

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
      this.notification.sendError('Faild to create new wallet');
      return;
    }
    this.newSeed = result.seed;
    this.newWalletId = result.walletId;
    this.newWalletIndex = result.walletIndex;

    this.activePanel = 3;
    this.notification.sendSuccess(`Successfully created new wallet! Make sure to write down your seed!`);
  }

  importWallet() {
    let seed = '';
    if (this.selectedImportOption === ImportOption.SEED) {
      if (!/^[0-9A-Fa-f]{64}$/.test(this.importSeedModel)) {
        this.notification.sendError('Seed is invalid, double check it!');
        return;
      }
      seed = this.importSeedModel;
    }

    let result = this.wallets.createWallet('', seed);
    if (result.errorCode !== WalletErrorCode.SUCCESS || !result.walletIndex || !result.walletId) {
      this.notification.sendError(`Unexpected error while importing wallet!`, { timeout: 0 });
      return;
    }
    
    this.newWalletId = result.walletId;
    this.newWalletIndex = result.walletIndex;
    this.activePanel = 4;
    this.importSeedModel = '';
    this.notification.sendSuccess(`Successfully imported wallet!`);
  }

  confirmNewSeed() {
    this.newSeed = '';
    this.activePanel = 4;
  }

  copied() {
    this.notification.sendSuccess(`Wallet seed copied to clipboard!`);
  }

  saveWalletPassword() {
    if (this.walletPasswordConfirmModel !== this.walletPasswordModel) {
      return this.notification.sendError(`Password confirmation does not match, try again!`);
    }

    if (this.walletPasswordModel.length < 1) {
      return this.notification.sendWarning(`Password cannot be empty!`);
    }

    let password = this.walletPasswordModel;
    let result = this.wallets.setWalletPassword(this.newWalletId, password);
    if (result.errorCode === WalletErrorCode.SUCCESS) {
      this.walletPasswordModel = '';
      this.walletPasswordConfirmModel = '';
      this.activePanel = 5;
      this.newWalletId = '';
      this.notification.sendSuccess(`Successfully set wallet password!`);
    }
    else if (result.errorCode === WalletErrorCode.MISS) {
      this.notification.sendWarning(`The wallet has already been deleted!`);
      this.router.navigate(['']);
    }
    else if (result.errorCode === WalletErrorCode.LOCKED) {
      this.notification.sendError(`The wallet is locked.`);
      this.router.navigate(['']);
    }
    else {
    }
  }

}

enum ImportOption {
  SEED = 'seed'
}