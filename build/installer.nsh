; Post-install: register Windows Explorer context menu and flush the shell icon cache.
!macro customInstall
  ; "Open with Orbit" on folder right-click
  WriteRegStr HKCU "Software\Classes\Directory\shell\orbit" "" "Open with Orbit"
  WriteRegStr HKCU "Software\Classes\Directory\shell\orbit" "Icon" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}",0'
  WriteRegStr HKCU "Software\Classes\Directory\shell\orbit\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'

  ; "Open with Orbit" when right-clicking inside a folder (background)
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\orbit" "" "Open with Orbit"
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\orbit" "Icon" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}",0'
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\orbit\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%V"'

  ; Flush the Windows shell icon/registry cache
  System::Call 'shell32.dll::SHChangeNotify(i, i, i, i) v (0x08000000, 0, 0, 0)'
!macroend

!macro customUnInstall
  DeleteRegKey HKCU "Software\Classes\Directory\shell\orbit"
  DeleteRegKey HKCU "Software\Classes\Directory\Background\shell\orbit"
  System::Call 'shell32.dll::SHChangeNotify(i, i, i, i) v (0x08000000, 0, 0, 0)'
!macroend
