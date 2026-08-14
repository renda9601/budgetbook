"use client";

import { supabase, hasSupabaseConfig } from "./supabaseClient";
import {
  DEFAULT_ACCOUNTS,
  DEFAULT_ASSETS,
  DEFAULT_CARDS,
  DEFAULT_CATEGORIES,
  DEFAULT_MEMBERS,
  SAMPLE_FIXED_EXPENSES,
  SAMPLE_INSTALLMENTS,
  SAMPLE_TRANSACTIONS
} from "./defaultData";

const STORAGE_KEY = "family-budgetbook-demo";

export function loadLocalData() {
  if (typeof window === "undefined") return initialData();
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (!saved) return initialData();
  try {
    return { ...initialData(), ...JSON.parse(saved), members: DEFAULT_MEMBERS, assets: DEFAULT_ASSETS };
  } catch {
    return initialData();
  }
}

export function saveLocalData(data) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export async function fetchHouseholdData(loginId) {
  if (!hasSupabaseConfig) return loadLocalData();

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) throw new Error("로그인 사용자 정보를 확인할 수 없습니다.");

  const { data: ownMemberships, error: ownMemberError } = await supabase
    .from("household_members")
    .select("id, household_id, user_id, display_name, role, status")
    .eq("user_id", authData.user.id)
    .eq("status", "active")
    .limit(1);

  if (ownMemberError) throw ownMemberError;
  const householdId = ownMemberships?.[0]?.household_id;
  if (!householdId) throw new Error("로그인 계정에 연결된 가족 정보를 찾을 수 없습니다.");

  const results = await Promise.all([
    supabase.from("household_members").select("id, household_id, user_id, display_name, role, status").eq("household_id", householdId).eq("status", "active").order("created_at"),
    supabase.from("assets").select("*").eq("household_id", householdId).eq("is_active", true).order("sort_order"),
    supabase.from("cards").select("*").eq("household_id", householdId).order("sort_order"),
    supabase.from("accounts").select("*").eq("household_id", householdId).order("sort_order"),
    supabase.from("categories").select("*").eq("household_id", householdId).eq("is_active", true).order("sort_order"),
    supabase.from("transactions").select("*").eq("household_id", householdId).order("transaction_date", { ascending: false }),
    supabase.from("fixed_expenses").select("*").eq("household_id", householdId).order("due_day"),
    supabase.from("installments").select("*").eq("household_id", householdId).order("start_month")
  ]);

  const firstError = results.find((result) => result.error)?.error;
  if (firstError) throw firstError;

  const [membersResult, assetsResult, cardsResult, accountsResult, categoriesResult, transactionsResult, fixedResult, installmentsResult] = results;
  if (!membersResult.data?.length) throw new Error("가족 구성원 정보가 없습니다.");
  if (!assetsResult.data?.length) throw new Error("사용할 수 있는 자산이 없습니다. Supabase 자산 데이터를 확인해 주세요.");
  if (!categoriesResult.data?.length) throw new Error("사용할 수 있는 카테고리가 없습니다. Supabase 카테고리 데이터를 확인해 주세요.");

  const members = attachLoginIds(membersResult.data, authData.user.id, loginId);

  return {
    householdId,
    authUserId: authData.user.id,
    members,
    assets: assetsResult.data,
    transactions: transactionsResult.data || [],
    cards: cardsResult.data || [],
    accounts: accountsResult.data || [],
    categories: categoriesResult.data,
    fixedExpenses: fixedResult.data || [],
    installments: installmentsResult.data || []
  };
}

export async function insertTransaction(householdId, transaction) {
  if (!hasSupabaseConfig || !householdId) return { ...transaction, id: crypto.randomUUID() };
  const { data, error } = await supabase
    .from("transactions")
    .insert({ ...transaction, household_id: householdId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateTransaction(id, householdId, transaction) {
  if (!hasSupabaseConfig) return { ...transaction, id };
  const { data, error } = await supabase
    .from("transactions")
    .update(transaction)
    .eq("id", id)
    .eq("household_id", householdId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteTransaction(id, householdId) {
  if (!hasSupabaseConfig) return;
  const { error } = await supabase.from("transactions").delete().eq("id", id).eq("household_id", householdId);
  if (error) throw error;
}

function initialData() {
  return {
    householdId: "demo-household",
    authUserId: null,
    members: DEFAULT_MEMBERS,
    assets: DEFAULT_ASSETS,
    transactions: SAMPLE_TRANSACTIONS,
    cards: DEFAULT_CARDS,
    accounts: DEFAULT_ACCOUNTS,
    categories: DEFAULT_CATEGORIES,
    fixedExpenses: SAMPLE_FIXED_EXPENSES,
    installments: SAMPLE_INSTALLMENTS
  };
}

function attachLoginIds(members, currentUserId, currentLoginId) {
  const otherLoginId = currentLoginId === "mom" ? "dad" : "mom";
  return members.map((member) => ({
    ...member,
    login_id: member.user_id === currentUserId ? currentLoginId : otherLoginId
  }));
}
