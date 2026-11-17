// 運用担当者・所属が使うアプリ向けの入口。家族向けの FamilyClient とは別の Cookie（__Host-blg-sid）・別のパス（/api/v1/blg）を使う。
//
//   const api = new BlgClient({ onUnauthenticated: () => showLogin(), onElevationRequired: () => askPassword() });
//   const login = await api.sessions.login(loginId, password);
//   if (login.authStage === 0) { ... パスキーの確認（login.passkeyRegistered）または登録 ... }

import { ApiClient } from "./ApiClient.js";
import { BlgSessionApi } from "./BlgSessionApi.js";
import { BlgAccountApi } from "./BlgAccountApi.js";
import { BlgPasskeyApi } from "./BlgPasskeyApi.js";
import { BlgInvitationApi } from "./BlgInvitationApi.js";
import { BlgAdminApi } from "./BlgAdminApi.js";
import { BlgFamilyApi } from "./BlgFamilyApi.js";
import { BlgTestDataApi } from "./BlgTestDataApi.js";

export class BlgClient {
  /** @param {import("./ApiClient.js").ApiClientOptions & { credentials?: CredentialsContainer }} [options] */
  constructor(options = {}) {
    this.http = new ApiClient({ ...options, basePath: options.basePath ?? "/api/v1/blg" });
    this.sessions = new BlgSessionApi(this.http, { credentials: options.credentials });
    this.account = new BlgAccountApi(this.http);
    this.passkeys = new BlgPasskeyApi(this.http, { credentials: options.credentials });
    this.invitations = new BlgInvitationApi(this.http);
    this.admin = new BlgAdminApi(this.http);
    this.families = new BlgFamilyApi(this.http);
    this.testData = new BlgTestDataApi(this.http);
  }
}
