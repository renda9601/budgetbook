const ASSET_TYPE_LABELS = {
  cash: "현금",
  credit_card: "신용카드",
  bank_account: "은행 계좌",
  local_currency: "지역화폐"
};

export function assetTypeLabel(type) {
  return ASSET_TYPE_LABELS[type] || type || "자산";
}

export function assetTypeToPaymentMethod(type) {
  return {
    cash: "cash",
    credit_card: "card",
    bank_account: "bank",
    local_currency: "local_currency"
  }[type] || "bank";
}

export function findTransactionOwner(transaction, members = []) {
  return members.find((member) => member.id === transaction.owner_member_id)
    || members.find((member) => member.login_id === transaction.owner_user_id);
}

export function transactionAssetLabel(transaction, assets = [], cards = [], accounts = []) {
  const findAssetName = (id) => assets.find((asset) => asset.id === id)?.name;
  if (transaction.type === "transfer") {
    const from = findAssetName(transaction.from_asset_id) || legacyAssetName(transaction, cards, accounts) || "출발 자산";
    const to = findAssetName(transaction.to_asset_id) || "도착 자산";
    return `${from} → ${to}`;
  }

  const assetId = transaction.type === "income" ? transaction.to_asset_id : transaction.from_asset_id;
  return findAssetName(assetId) || legacyAssetName(transaction, cards, accounts) || assetTypeLabel(transaction.payment_method);
}

export function buildTransactionPayload(form, context) {
  const { assets = [], members = [], authUserId, loginId, existing } = context;
  const amount = Number(form.amount);
  const owner = members.find((member) => member.id === form.owner_member_id);

  if (!form.transaction_date) throw new Error("거래 날짜를 선택해 주세요.");
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("금액은 0원보다 크게 입력해 주세요.");
  if (!owner) throw new Error("거래 사용자를 선택해 주세요.");
  if (!String(form.merchant || "").trim()) throw new Error("내용 또는 사용처를 입력해 주세요.");

  const isTransfer = form.type === "transfer";
  const primaryAssetId = form.type === "income" ? form.to_asset_id : form.from_asset_id;
  const primaryAsset = assets.find((asset) => asset.id === primaryAssetId);
  const destinationAsset = assets.find((asset) => asset.id === form.to_asset_id);

  if (!primaryAsset) throw new Error(form.type === "income" ? "입금 자산을 선택해 주세요." : "출금 자산을 선택해 주세요.");
  if (isTransfer && !destinationAsset) throw new Error("입금 자산을 선택해 주세요.");
  if (isTransfer && form.from_asset_id === form.to_asset_id) throw new Error("이체의 출금 자산과 입금 자산은 달라야 합니다.");
  if (!isTransfer && !form.category_id) throw new Error("카테고리를 선택해 주세요.");

  const legacy = legacyFieldsForAsset(primaryAsset);
  const payload = {
    transaction_date: form.transaction_date,
    type: form.type,
    amount,
    payment_method: legacy.payment_method,
    card_id: legacy.card_id,
    account_id: legacy.account_id,
    category_id: isTransfer ? null : form.category_id,
    merchant: String(form.merchant || "").trim(),
    memo: String(form.memo || "").trim(),
    owner_user_id: owner.login_id,
    owner_member_id: owner.id,
    usage_scope: "member",
    created_by: existing?.created_by || loginId,
    created_by_user_id: existing?.created_by_user_id || authUserId || null,
    updated_by_user_id: existing ? authUserId || null : null,
    from_asset_id: form.type === "income" ? null : form.from_asset_id,
    to_asset_id: form.type === "expense" ? null : form.to_asset_id,
    source: existing?.source || "manual",
    is_fixed: Boolean(form.is_fixed),
    is_installment: Boolean(form.is_installment),
    migration_review_required: false
  };

  return payload;
}

export function formValuesFromTransaction(transaction, assets = [], members = []) {
  const legacyAssetId = transaction.card_id || transaction.account_id || "";
  const owner = findTransactionOwner(transaction, members);
  const fallbackAsset = assets.find((asset) => asset.id === legacyAssetId)?.id || assets[0]?.id || "";

  return {
    transaction_date: transaction.transaction_date,
    type: transaction.type,
    amount: String(transaction.amount),
    from_asset_id: transaction.from_asset_id || (transaction.type !== "income" ? fallbackAsset : ""),
    to_asset_id: transaction.to_asset_id || (transaction.type === "income" ? fallbackAsset : ""),
    category_id: transaction.category_id || "",
    merchant: transaction.merchant || "",
    memo: transaction.memo || "",
    owner_member_id: owner?.id || members[0]?.id || "",
    is_fixed: Boolean(transaction.is_fixed),
    is_installment: Boolean(transaction.is_installment)
  };
}

function legacyFieldsForAsset(asset) {
  const payment_method = assetTypeToPaymentMethod(asset.type);
  const legacyId = asset.legacy_id || asset.id;
  return {
    payment_method,
    card_id: payment_method === "card" ? legacyId : null,
    account_id: payment_method === "card" ? null : legacyId
  };
}

function legacyAssetName(transaction, cards, accounts) {
  if (transaction.card_id) return cards.find((card) => card.id === transaction.card_id)?.name;
  if (transaction.account_id) return accounts.find((account) => account.id === transaction.account_id)?.name;
  return "";
}
