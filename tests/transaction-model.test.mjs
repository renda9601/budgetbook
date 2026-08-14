import assert from "node:assert/strict";
import { buildTransactionPayload, transactionAssetLabel } from "../lib/transactionModel.js";

const members = [
  { id: "member-dad", login_id: "dad", display_name: "아빠" },
  { id: "member-mom", login_id: "mom", display_name: "엄마" }
];

const assets = [
  { id: "card-shinhan", type: "credit_card", name: "신한카드", legacy_id: "card-shinhan" },
  { id: "local-money", type: "local_currency", name: "지역화폐", legacy_id: "local-money" },
  { id: "bank-main", type: "bank_account", name: "주거래계좌", legacy_id: "bank-main" }
];

const baseForm = {
  transaction_date: "2026-08-14",
  type: "expense",
  amount: "30000",
  from_asset_id: "card-shinhan",
  to_asset_id: "",
  category_id: "food",
  merchant: "점심",
  memo: "가족 식사",
  owner_member_id: "member-dad",
  is_fixed: false,
  is_installment: false
};

const dadExpense = buildTransactionPayload(baseForm, {
  assets,
  members,
  authUserId: "auth-dad",
  loginId: "dad"
});

assert.equal(dadExpense.amount, 30000);
assert.equal(dadExpense.owner_member_id, "member-dad");
assert.equal(dadExpense.owner_user_id, "dad");
assert.equal(dadExpense.created_by_user_id, "auth-dad");
assert.equal(dadExpense.from_asset_id, "card-shinhan");
assert.equal(dadExpense.to_asset_id, null);
assert.equal(dadExpense.payment_method, "card");
assert.equal(dadExpense.card_id, "card-shinhan");
assert.equal(dadExpense.source, "manual");

const momLocalExpense = buildTransactionPayload({
  ...baseForm,
  from_asset_id: "local-money",
  owner_member_id: "member-mom"
}, {
  assets,
  members,
  authUserId: "auth-dad",
  loginId: "dad"
});

assert.equal(momLocalExpense.owner_user_id, "mom");
assert.equal(momLocalExpense.created_by, "dad");
assert.equal(momLocalExpense.payment_method, "local_currency");
assert.equal(momLocalExpense.account_id, "local-money");

const transfer = buildTransactionPayload({
  ...baseForm,
  type: "transfer",
  from_asset_id: "bank-main",
  to_asset_id: "local-money",
  category_id: ""
}, {
  assets,
  members,
  authUserId: "auth-dad",
  loginId: "dad"
});

assert.equal(transfer.category_id, null);
assert.equal(transfer.from_asset_id, "bank-main");
assert.equal(transfer.to_asset_id, "local-money");
assert.equal(transactionAssetLabel(transfer, assets), "주거래계좌 → 지역화폐");

assert.throws(() => buildTransactionPayload({
  ...baseForm,
  type: "transfer",
  from_asset_id: "bank-main",
  to_asset_id: "bank-main",
  category_id: ""
}, { assets, members, authUserId: "auth-dad", loginId: "dad" }), /달라야 합니다/);

assert.throws(() => buildTransactionPayload({ ...baseForm, amount: "0" }, {
  assets,
  members,
  authUserId: "auth-dad",
  loginId: "dad"
}), /0원보다 크게/);

console.log("transaction model tests passed");
