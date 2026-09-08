import { z } from "zod";
import { storedChatResponseSchema } from "@/lib/db/schemas";
import type { ChatThread, StoredChatResponse } from "@/lib/db/chats";
import { readAllRows, storageOperation, StorageError, type SupabaseClientFactory } from "@/lib/db/supabase";

const rowSchema = z.object({ id:z.string(), thread_id:z.string(), question:z.string(), response:storedChatResponseSchema, timestamp:z.string().datetime({offset:true}).transform(value=>new Date(value).toISOString()) });
export function createGeneralChatStore(ownerId:string,getClient:SupabaseClientFactory) {
  if (!ownerId.trim()) throw new StorageError();
  return {
    async append(entry:{id:string;threadId:string;question:string;response:StoredChatResponse;timestamp:string}) {
      const row=rowSchema.parse({id:entry.id,thread_id:entry.threadId,question:entry.question,response:entry.response,timestamp:entry.timestamp});
      return storageOperation(async()=>{const {error}=await getClient().from("general_chats").insert({...row,owner_user_id:ownerId});if(error)throw new StorageError();});
    },
    async listThreads():Promise<ChatThread[]> {
      return storageOperation(async()=>{const rows=rowSchema.array().parse(await readAllRows(()=>getClient().from("general_chats").select("id,thread_id,question,response,timestamp").eq("owner_user_id",ownerId).order("timestamp").order("id")));
        const threads=new Map<string,ChatThread>();
        for(const row of rows){const entry={question:row.question,response:row.response,timestamp:row.timestamp};const thread=threads.get(row.thread_id);if(thread)thread.entries.push(entry);else threads.set(row.thread_id,{threadId:row.thread_id,startedAt:row.timestamp,entries:[entry]});}
        return [...threads.values()].sort((a,b)=>a.startedAt.localeCompare(b.startedAt));
      });
    },
  };
}
