; installer.nsh — custom NSIS macros for HomebuddyFormatter
; Runs AFTER electron-builder registers file associations.
; Overrides the DefaultIcon registry entry for .json / .jsonl / .ndjson
; to use our dedicated white file-type icon instead of the app icon.

!macro customInstall
  ; icon-json.ico is installed to $INSTDIR\resources\icon-json.ico
  ; via extraResources in package.json
  StrCpy $R9 "$INSTDIR\resources\icon-json.ico,0"

  ; .json
  ReadRegStr $R0 HKCR ".json" ""
  ${If} $R0 != ""
    WriteRegStr HKCR "$R0\DefaultIcon" "" "$R9"
  ${EndIf}

  ; .jsonl
  ReadRegStr $R0 HKCR ".jsonl" ""
  ${If} $R0 != ""
    WriteRegStr HKCR "$R0\DefaultIcon" "" "$R9"
  ${EndIf}

  ; .ndjson
  ReadRegStr $R0 HKCR ".ndjson" ""
  ${If} $R0 != ""
    WriteRegStr HKCR "$R0\DefaultIcon" "" "$R9"
  ${EndIf}

  ; Tell the shell to refresh icon cache immediately
  System::Call 'shell32.dll::SHChangeNotify(i, i, i, i) v (0x08000000, 0, 0, 0)'
!macroend

!macro customUnInstall
  ; Nothing extra needed — electron-builder cleans up the ProgId keys on uninstall
!macroend
