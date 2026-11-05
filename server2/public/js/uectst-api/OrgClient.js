// 研究者・組織が使うアプリ向けの入口。家族向けの FamilyClient とは別の Cookie（__Host-org-sid）・別のパス（/api/v1/org）を使う。
//
//   const api = new OrgClient({ onUnauthenticated: () => showLogin(), onElevationRequired: () => askPassword() });
//   const login = await api.sessions.login(loginId, password);
//   if (login.authStage === 0) { ... パスキーの確認（login.passkeyRegistered）または登録 ... }

import { ApiClient } from "./ApiClient.js";
import { OrgSessionApi } from "./OrgSessionApi.js";
import { OrgAccountApi } from "./OrgAccountApi.js";
import { OrgPasskeyApi } from "./OrgPasskeyApi.js";
import { OrgInvitationApi } from "./OrgInvitationApi.js";
import { OrgAdminApi } from "./OrgAdminApi.js";
import { OrgTestDataApi } from "./OrgTestDataApi.js";

export class OrgClient {
  /** @param {import("./ApiClient.js").ApiClientOptions & { credentials?: CredentialsContainer }} [options] */
  constructor(options = {}) {
    this.http = new ApiClient({ ...options, basePath: options.basePath ?? "/api/v1/org" });
    this.sessions = new OrgSessionApi(this.http, { credentials: options.credentials });
    this.account = new OrgAccountApi(this.http);
    this.passkeys = new OrgPasskeyApi(this.http, { credentials: options.credentials });
    this.invitations = new OrgInvitationApi(this.http);
    this.admin = new OrgAdminApi(this.http);
    this.testData = new OrgTestDataApi(this.http);
  }
}
