"use client";

import { supabase, hasSupabaseConfig } from "./supabaseClient";
import {
  DEFAULT_ACCOUNTS,
  DEFAULT_CARDS,
  DEFAULT_CATEGORIES,
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
    return { ...initialData(), ...JSON.parse(saved) };
  } catch {
    return initialData();
  }
}

export function saveLocalData(data) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export async function fetchHouseholdData() {
  if (!hasSupabaseConfig) return loadLocalData();

  const [{ data: memberships, error: memberError }, { data: cards }, { data: accounts }, { data: categories }] = await Promise.all([
    supabase.from("household_members").select("household_id, display_name, role").limit(1),
    supabase.from("cards").select("*").order("sort_order"),
    supabase.from("accounts").select("*").order("sort_order"),
    supabase.from("categories").select("*").order("sort_order")
  ]);

  if (memberError) throw memberError;
  const householdId = memberships?.[0]?.household_id;
  if (!householdId) return loadLocalData();

  const [{ data: transactions }, { data: fixedExpenses }, { data: installments }] = await Promise.all([
    supabase.from("transactions").select("*").eq("household_id", householdId).order("transaction_date", { ascending: false }),
    supabase.from("fixed_expenses").select("*").eq("household_id", householdId).order("due_day"),
    supabase.from("installments").select("*").eq("household_id", householdId).order("start_month")
  ]);

  return {
    householdId,
    transactions: transactions || [],
    cards: cards?.length ? cards : DEFAULT_CARDS,
    accounts: accounts?.length ? accounts : DEFAULT_ACCOUNTS,
    categories: categories?.length ? categories : DEFAULT_CATEGORIES,
    fixedExpenses: fixedExpenses || [],
    installments: installments || []
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

export async function updateTransaction(id, transaction) {
  if (!hasSupabaseConfig) return { ...transaction, id };
  const { data, error } = await supabase
    .from("transactions")
    .update(transaction)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteTransaction(id) {
  if (!hasSupabaseConfig) return;
  const { error } = await supabase.from("transactions").delete().eq("id", id);
  if (error) throw error;
}

function initialData() {
  return {
    householdId: "demo-household",
    transactions: SAMPLE_TRANSACTIONS,
    cards: DEFAULT_CARDS,
    accounts: DEFAULT_ACCOUNTS,
    categories: DEFAULT_CATEGORIES,
    fixedExpenses: SAMPLE_FIXED_EXPENSES,
    installments: SAMPLE_INSTALLMENTS
  };
}
