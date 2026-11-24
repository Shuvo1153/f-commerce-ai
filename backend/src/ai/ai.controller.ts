import { Body, Controller, HttpException, HttpStatus, Ip, Post } from "@nestjs/common";
import { AiService } from "./ai.service";

@Controller("ai")
export class AiController {
  private readonly aiRequests = new Map<string, number[]>();

  constructor(private readonly aiService: AiService) {}

  @Post("search")
  searchProducts(@Ip() ip: string, @Body() body: unknown) {
    this.enforceRateLimit(ip);
    return this.aiService.searchProducts(body);
  }

  @Post("chat")
  chat(@Ip() ip: string, @Body() body: unknown) {
    this.enforceRateLimit(ip);
    return this.aiService.chat(body);
  }

  private enforceRateLimit(ip: string) {
    const now = Date.now();
    const cutoff = now - 60_000;
    const key = ip || "unknown";
    const recent = (this.aiRequests.get(key) || []).filter((timestamp) => timestamp > cutoff);
    if (recent.length >= 10) {
      throw new HttpException("Please wait a minute before making another AI request.", HttpStatus.TOO_MANY_REQUESTS);
    }
    recent.push(now);
    this.aiRequests.set(key, recent);
    if (this.aiRequests.size > 1000) {
      for (const [address, timestamps] of this.aiRequests) {
        const activeRequests = timestamps.filter((timestamp) => timestamp > cutoff);
        if (activeRequests.length === 0) this.aiRequests.delete(address);
        else this.aiRequests.set(address, activeRequests);
      }
    }
  }
}
