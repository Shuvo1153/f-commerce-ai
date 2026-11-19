import { Body, Controller, Headers, Post } from "@nestjs/common";
import { getUserIdFromAuthorization } from "../auth/access-token";
import { AiService } from "./ai.service";

@Controller("ai")
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post("chat")
  chat(
    @Headers("authorization") authorization: string | undefined,
    @Body() body: unknown,
  ) {
    getUserIdFromAuthorization(authorization, "Sign in to use the shopping assistant.");
    return this.aiService.chat(body);
  }
}
