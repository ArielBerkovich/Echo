!include nsDialogs.nsh
!include LogicLib.nsh

Var StartOnBoot
Var StartOnBootState

Function EchoStartupPage
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}
  ${NSD_CreateLabel} 0 0 100% 28u "Choose whether Echo should start automatically when you sign in to Windows."
  Pop $0
  ${NSD_CreateCheckbox} 0 38u 100% 14u "Start Echo when Windows starts"
  Pop $StartOnBoot
  ${NSD_SetState} $StartOnBoot ${BST_CHECKED}
  nsDialogs::Show
FunctionEnd

Function EchoStartupPageLeave
  ${NSD_GetState} $StartOnBoot $StartOnBootState
FunctionEnd

!macro customPageAfterChangeDir
  Page custom EchoStartupPage EchoStartupPageLeave
!macroend

!macro customInstall
  ${If} $StartOnBootState == ${BST_CHECKED}
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Echo" '"$INSTDIR\Echo.exe" --startup'
  ${Else}
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Echo"
  ${EndIf}
!macroend

!macro customUnInstall
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Echo"
!macroend
