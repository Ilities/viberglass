import { gzipSync } from "node:zlib";
import { STORED_LOGIN_GZIP_PREFIX } from "@viberglass/types";
import { decodeStoredLogin } from "../src/agentAuthLifecycle";

describe("decodeStoredLogin", () => {
  const login = '{"account_id":"acct_123","token":"abc"}';

  test("unzips a login gzipped to fit a store's size limit", () => {
    expect(decodeStoredLogin(`${STORED_LOGIN_GZIP_PREFIX}${gzipSync(Buffer.from(login)).toString("base64")}`)).toBe(login);
  });

  test("passes a plain login through", () => {
    expect(decodeStoredLogin(` ${login} `)).toBe(login);
  });
});
