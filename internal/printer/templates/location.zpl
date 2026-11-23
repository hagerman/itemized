^XA
^CI28
^BY0,0,0^FO20,40^BQN,2,5^FDQA,{{.Payload.Barcode}}^FS
^FO250,40^A0,52^FB420,3,-3,L,0^FD{{.Payload.LocationName}}^FS
{{ if .Payload.ParentLocationName }}
^FO250,195^A0,28^FB420,2,0,L,0^FD{{.Payload.ParentLocationName}}^FS
{{ end }}
^XZ
