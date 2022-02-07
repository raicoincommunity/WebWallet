import { Component, OnInit } from '@angular/core';
import { TokenService, AccountTokenInfo } from '../../services/token.service';

@Component({
  selector: 'app-assets',
  templateUrl: './assets.component.html',
  styleUrls: ['./assets.component.css']
})
export class AssetsComponent implements OnInit {
  constructor(
    private token: TokenService
  ) { }

  ngOnInit(): void {
  }

  tokens(): AccountTokenInfo[] {
    return this.token.tokens();
  }

  empty(): boolean {
    return this.tokens().length === 0;
  }

}
