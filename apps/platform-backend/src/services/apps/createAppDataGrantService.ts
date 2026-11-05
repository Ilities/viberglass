import { AppDataGrantDAO } from "../../persistence/apps/AppDataGrantDAO";
import { SpaceOwnershipDAO } from "../../persistence/project/SpaceOwnershipDAO";
import { TicketDAO } from "../../persistence/ticketing/TicketDAO";
import { UserDAO } from "../../persistence/user/UserDAO";
import { AuditRecorder } from "../audit/AuditRecorder";
import { TaskActivityRecorder } from "../tasks/TaskActivityRecorder";
import { TaskAskPolicyService } from "../taskTurns/TaskAskPolicyService";
import { AppDataCopier } from "./AppDataCopier";
import { AppDataGrantService } from "./AppDataGrantService";

export function createAppDataGrantService(): AppDataGrantService {
  return new AppDataGrantService({
    policy: new TaskAskPolicyService(),
    owners: new SpaceOwnershipDAO(),
    tickets: new TicketDAO(),
    grants: new AppDataGrantDAO(),
    copier: new AppDataCopier(),
    users: new UserDAO(),
    activity: new TaskActivityRecorder(),
    audit: new AuditRecorder(),
  });
}
