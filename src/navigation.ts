import { GaitReportRecord } from './storage/reportRecord';
import { PoseFrame } from './gait/types';

export type RootStackParamList = {
  Onboarding: undefined;
  SignIn: undefined;
  Home: undefined;
  ScanSetup: undefined;
  CameraGuide: { goal: string };
  PoseScan: { goal: string };
  Processing: { goal: string; frames?: PoseFrame[] };
  Result: { report: GaitReportRecord };
  ShoeMatches: { report: GaitReportRecord };
  Paywall: undefined;
  Profile: undefined;
};
