import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';
import { Subject, BehaviorSubject, never } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ServerService {
  private stateSubject = new BehaviorSubject(ServerState.DISCONNECTED);
  private messageSubject = new Subject<any>();
  
  private ws: WebSocket | null = null;
  private currentServerUrl = '';
  private readonly reconnectInterval = 10 * 1000;

  private serverTimestamp = 0;
  private localTimestamp = 0;
  private readonly timeSyncInterval = 300 * 1000;


  state$ = this.stateSubject.asObservable();
  message$ = this.messageSubject.asObservable();


  constructor() {
    this.state$.subscribe((state) => this.onStateChange(state));
    this.message$.subscribe((message) => this.onMessage(message));

    this.tryReconnect();
    setInterval(() => this.tryReconnect(), this.reconnectInterval);

    if (window.performance) {
      setInterval(() => this.syncTimestamp(), this.timeSyncInterval);
    }
  }

  getState() : ServerState {
    return this.stateSubject.value;
  }
  
  getTimestamp(): number {
    if (this.serverTimestamp === 0 || !window.performance) {
      return Date.now() / 1000 | 0;
    }

    let diff = (window.performance.now() / 1000 | 0) - this.localTimestamp;
    return this.serverTimestamp + diff;
  }

  forceReconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.changeState(ServerState.DISCONNECTED);
    }

    this.connect();
  }

  send(message: any) {
    if (this.ws && this.getState() === ServerState.CONNECTED)
    {
      this.ws.send(JSON.stringify(message));
      console.log('[debug]send message:', message);
    }
  }

  private tryReconnect() {
    if (this.stateSubject.value !== ServerState.DISCONNECTED)
    {
      return;
    }

    this.forceReconnect();
  }

  private syncTimestamp() {
    if (this.getState() !== ServerState.CONNECTED) {
      return;
    }

    let request = {action: 'current_timestamp'};
    this.send(request);
  }

  private onStateChange(state: ServerState) {
    switch (state) {
      case ServerState.CONNECTED:
        this.onConnect();
        break;
      case ServerState.DISCONNECTED:
      case ServerState.CONNECTING:
        break;
      default:
        let _: never = state;
    }
  }

  private onConnect() {
    this.syncTimestamp();
  }

  private onMessage(message: any) {
    if (message.ack) {
      switch (message.ack) {
        case 'current_timestamp':
          this.processCurrentTimestamp(message);
          break;
        default:
          break;
      }
    }
    else if (message.notify) {

    } else {
      console.log('Error in server response:', message);
    }
  }

  private processCurrentTimestamp(message: any) {
    if (!message.timestamp) {
      console.log('Error: failed to get timestamp from message =', message);
      return;
    }

    this.serverTimestamp = parseInt(message.timestamp);
    this.localTimestamp = window.performance.now() / 1000 | 0;
  }

  private getServerUrl(): string {
    let default_servers = environment.default_servers;
    if (default_servers && default_servers.length)
    {
      return 'wss://' + default_servers[0];
    }

    return '';
  }

  private changeState(state: ServerState) {
    if (state !== this.stateSubject.value)
    {
      this.stateSubject.next(state);
    }
  }

  private connect() {
    if (this.ws)
    {
      console.log('Warning: the connecton already exists');
      return;
    }

    this.currentServerUrl = this.getServerUrl();
    if (!this.currentServerUrl)
    {
      console.log('Error: failed to get server url');
      return;
    }

    this.stateSubject.next(ServerState.CONNECTING);
    let ws = new WebSocket(this.currentServerUrl);
    this.ws = ws;

    this.ws.onopen = event => {
      if (ws === this.ws) {
        console.log('Info: connected, event=', event);
        this.changeState(ServerState.CONNECTED);  
      }
    };

    this.ws.onerror = event => {
      if (ws === this.ws) {
        console.log('Error: failed to connect to server, event=', event);
        this.changeState(ServerState.DISCONNECTED);
      }
    };

    this.ws.onclose = event => {
      if (ws === this.ws) {
        console.log('Info: connecttion closed, event=', event);
        this.changeState(ServerState.DISCONNECTED);
        }
    };

    this.ws.onmessage = event => {
      try {
        if (ws === this.ws) {
          let message = JSON.parse(event.data);
          this.messageSubject.next(message);
          console.log('[debug] receive message:', message);
        }
      } catch (err) {
        console.log('Error: Failed to parse message, error=', err);
      }
    }
  }
}

export enum ServerState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected'
}

