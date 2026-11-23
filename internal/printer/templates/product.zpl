^XA
^CI28
^BY0,0,0^FO20,40^BQN,2,5^FDQA,{{.Payload.Barcode}}^FS
^FO250,40^A0,48^FB420,4,-3,L,0^FD{{.Payload.ProductName}}^FS
{{ if .Payload.CategoryName }}
^FO250,200^A0,28^FB420,2,0,L,0^FD{{.Payload.CategoryName}}^FS
{{ end }}
^XZ
