import { supabase } from "./supabaseClient";
import type { Settings } from "./settings";
import type { UsageLogEntry } from "./usage";
import type { AppData } from "./types";
import type { ApifyLogEntry } from "./apifyUsage";

export interface UserDataRow {
  app_data: AppData;
  settings: Settings;
  usage_log: UsageLogEntry[];
  transcript_log: number[];
  transcript_backup_log: number[];
  apify_log: ApifyLogEntry[];
  apify_backup_log: ApifyLogEntry[];
}

export async function fetchUserRow(userId: string): Promise<UserDataRow | null> {
  const { data, error } = await supabase
    .from("user_data")
    .select("app_data, settings, usage_log, transcript_log, transcript_backup_log, apify_log, apify_backup_log")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data as UserDataRow | null;
}

export async function insertUserRow(userId: string, row: UserDataRow): Promise<void> {
  const { error } = await supabase.from("user_data").insert({ user_id: userId, ...row });
  if (error) throw error;
}

export async function updateAppData(userId: string, data: AppData): Promise<void> {
  const { error } = await supabase.from("user_data").update({ app_data: data }).eq("user_id", userId);
  if (error) throw error;
}

export async function updateSettingsRow(userId: string, settings: Settings): Promise<void> {
  const { error } = await supabase.from("user_data").update({ settings }).eq("user_id", userId);
  if (error) throw error;
}

export async function updateUsageLog(userId: string, log: UsageLogEntry[]): Promise<void> {
  const { error } = await supabase.from("user_data").update({ usage_log: log }).eq("user_id", userId);
  if (error) throw error;
}

export async function updateTranscriptLogs(userId: string, log: number[], backupLog: number[]): Promise<void> {
  const { error } = await supabase.from("user_data").update({ transcript_log: log, transcript_backup_log: backupLog }).eq("user_id", userId);
  if (error) throw error;
}

export async function updateApifyLogs(userId: string, log: ApifyLogEntry[], backupLog: ApifyLogEntry[]): Promise<void> {
  const { error } = await supabase.from("user_data").update({ apify_log: log, apify_backup_log: backupLog }).eq("user_id", userId);
  if (error) throw error;
}
