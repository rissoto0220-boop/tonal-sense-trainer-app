// 家族・ユーザが使うアプリ向けの入口。目的別のクラスを、ひとつにまとめて持つ。
//
//   const api = new FamilyClient({ onUnauthenticated: () => showLogin(), onElevationRequired: () => askRecoveryCode() });
//   await api.registration.start(email, captchaToken);
//   await api.sessions.login(code);

import { ApiClient } from "./ApiClient.js";
import { RegistrationApi } from "./RegistrationApi.js";
import { SessionApi } from "./SessionApi.js";
import { UserApi } from "./UserApi.js";
import { AccountApi } from "./AccountApi.js";
import { SuperuserApi } from "./SuperuserApi.js";
import { PasskeyApi } from "./PasskeyApi.js";

export class FamilyClient {
  /** @param {import("./ApiClient.js").ApiClientOptions} [options] */
  constructor(options = {}) {
    this.http = new ApiClient({ ...options, basePath: options.basePath ?? "/api/v1" });
    this.registration = new RegistrationApi(this.http);
    this.sessions = new SessionApi(this.http);
    this.users = new UserApi(this.http);
    this.account = new AccountApi(this.http);
    this.superuser = new SuperuserApi(this.http);
    this.passkeys = new PasskeyApi(this.http, { credentials: options.credentials });
  }
}
