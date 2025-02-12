import { z } from "@hono/zod-openapi";

export const deviceSchema = z.object({
  initial_user_agent: z
    .string()
    .describe("First user agent of the device from which this user logged in"),
  initial_ip: z
    .string()
    .describe("First IP address associated with this session"),
  initial_asn: z
    .string()
    .describe("First autonomous system number associated with this session"),
  last_user_agent: z
    .string()
    .describe("Last user agent of the device from which this user logged in"),
  last_ip: z
    .string()
    .describe("Last IP address from which this user logged in"),
  last_asn: z
    .string()
    .describe("Last autonomous system number from which this user logged in"),
});
