import {
  ListPostsTool,
  GetPostTool,
  UpdatePostTool,
  ManagePostScheduleTool,
  GetPostOptionsTool,
} from './manage.posts.tool';
import { IntegrationValidationTool } from '@gitroom/nestjs-libraries/chat/tools/integration.validation.tool';
import { IntegrationTriggerTool } from '@gitroom/nestjs-libraries/chat/tools/integration.trigger.tool';
import { IntegrationSchedulePostTool } from './integration.schedule.post';
import { GenerateVideoOptionsTool } from '@gitroom/nestjs-libraries/chat/tools/generate.video.options.tool';
import { VideoFunctionTool } from '@gitroom/nestjs-libraries/chat/tools/video.function.tool';
import { GenerateVideoTool } from '@gitroom/nestjs-libraries/chat/tools/generate.video.tool';
import { GenerateImageTool } from '@gitroom/nestjs-libraries/chat/tools/generate.image.tool';
import { IntegrationListTool } from '@gitroom/nestjs-libraries/chat/tools/integration.list.tool';
import { MediaListTool } from '@gitroom/nestjs-libraries/chat/tools/media.list.tool';
import { UploadMediaTool, UploadMediaFromUrlTool } from './media.upload.tool';
import {
  BeginMediaUploadTool,
  AppendMediaUploadTool,
  CompleteMediaUploadTool,
  GetMediaUploadTool,
  AbortMediaUploadTool,
} from './media.chunk-upload.tool';
import {
  GetAccountContextTool,
  GetAnalyticsTool,
  ListNotificationsTool,
} from './operational.query.tool';
import { KnowledgeQueryTool } from '@gitroom/nestjs-libraries/chat/tools/knowledge.query.tool';
import { WebSearchTool } from '@gitroom/nestjs-libraries/chat/tools/web-search.tool';
import { ExtractUrlsTool } from '@gitroom/nestjs-libraries/chat/tools/extract-urls.tool';
import { CreateCommentAutomationTool } from '@gitroom/nestjs-libraries/chat/tools/create.comment.automation.tool';
import { ListCommentAutomationsTool } from '@gitroom/nestjs-libraries/chat/tools/list.comment.automations.tool';
import { SetCommentAutomationStatusTool } from '@gitroom/nestjs-libraries/chat/tools/set.comment.automation.status.tool';
import {
  GetCommentAutomationTool,
  UpdateCommentAutomationTool,
  GetAutomationOptionsTool,
  GetAutomationHistoryTool,
  GetAutomationExecutionHistoryTool,
  GetAutomationExecutionDetailTool,
  ManageAutomationAliasesTool,
  SaveAutomationCanvasTool,
  ManageRepostAutomationTool,
} from './manage.automations.tool';

export const toolList = [
  ListPostsTool,
  GetPostTool,
  UpdatePostTool,
  ManagePostScheduleTool,
  GetPostOptionsTool,
  IntegrationListTool,
  MediaListTool,
  UploadMediaTool,
  UploadMediaFromUrlTool,
  BeginMediaUploadTool,
  AppendMediaUploadTool,
  CompleteMediaUploadTool,
  GetMediaUploadTool,
  AbortMediaUploadTool,
  GetAccountContextTool,
  GetAnalyticsTool,
  ListNotificationsTool,
  IntegrationValidationTool,
  IntegrationTriggerTool,
  IntegrationSchedulePostTool,
  GenerateVideoOptionsTool,
  VideoFunctionTool,
  GenerateVideoTool,
  GenerateImageTool,
  KnowledgeQueryTool,
  WebSearchTool,
  ExtractUrlsTool,
  CreateCommentAutomationTool,
  ListCommentAutomationsTool,
  SetCommentAutomationStatusTool,
  GetCommentAutomationTool,
  UpdateCommentAutomationTool,
  GetAutomationOptionsTool,
  GetAutomationHistoryTool,
  GetAutomationExecutionHistoryTool,
  GetAutomationExecutionDetailTool,
  ManageAutomationAliasesTool,
  SaveAutomationCanvasTool,
  ManageRepostAutomationTool,
];
