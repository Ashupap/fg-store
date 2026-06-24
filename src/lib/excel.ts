import type { DashboardRow } from '@/types';
import { formatDisplayDate, formatDisplayDateTime } from '@/lib/utils';

export function exportDashboardToExcel(data: DashboardRow[]): Buffer {
    // calculate totals
    let totalMCs = 0;
    let totalAvailable = 0;
    let totalReserved = 0;
    let totalAllocated = 0;
    let totalPending = 0;
    let totalDaysAging = 0;
    let validAgingCount = 0;

    data.forEach(row => {
        totalMCs += row.totalMCs;
        totalAvailable += row.availableMCs;
        totalReserved += row.reservedMCs;
        totalAllocated += row.allocatedMCs;
        totalPending += row.pendingPOMCs;
        if (row.daysAging !== undefined && row.daysAging !== null) {
            totalDaysAging += row.daysAging;
            validAgingCount++;
        }
    });

    const avgDaysAging = validAgingCount > 0 ? Math.round(totalDaysAging / validAgingCount) : 0;

    // Build SpreadsheetML XML
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <DocumentProperties xmlns="urn:schemas-microsoft-com:office:office">
  <Author>FG Store Management System</Author>
  <Created>${new Date().toISOString()}</Created>
 </DocumentProperties>
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Alignment ss:Vertical="Bottom"/>
   <Borders/>
   <Font ss:FontName="Segoe UI" x:Family="Swiss" ss:Size="11" ss:Color="#1E293B"/>
   <Interior/>
   <NumberFormat/>
   <Protection/>
  </Style>
  <Style ss:ID="Title">
   <Font ss:FontName="Segoe UI" x:Family="Swiss" ss:Size="16" ss:Bold="1" ss:Color="#0F172A"/>
   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
  </Style>
  <Style ss:ID="Subtitle">
   <Font ss:FontName="Segoe UI" x:Family="Swiss" ss:Size="10" ss:Italic="1" ss:Color="#64748B"/>
   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
  </Style>
  <Style ss:ID="Header">
   <Font ss:FontName="Segoe UI" x:Family="Swiss" ss:Size="11" ss:Color="#FFFFFF" ss:Bold="1"/>
   <Interior ss:Color="#1E3A8A" ss:Pattern="Solid"/>
   <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#0F172A"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#475569"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#475569"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#475569"/>
   </Borders>
  </Style>
  <Style ss:ID="DataString">
   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
   </Borders>
  </Style>
  <Style ss:ID="DataStringZebra">
   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
   <Interior ss:Color="#F8FAFC" ss:Pattern="Solid"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
   </Borders>
  </Style>
  <Style ss:ID="DataNumber">
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <NumberFormat ss:Format="#,##0"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
   </Borders>
  </Style>
  <Style ss:ID="DataNumberZebra">
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <Interior ss:Color="#F8FAFC" ss:Pattern="Solid"/>
   <NumberFormat ss:Format="#,##0"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
   </Borders>
  </Style>
  <Style ss:ID="DataCenter">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
   </Borders>
  </Style>
  <Style ss:ID="DataCenterZebra">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Interior ss:Color="#F8FAFC" ss:Pattern="Solid"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
   </Borders>
  </Style>
  <Style ss:ID="TotalLabel">
   <Font ss:FontName="Segoe UI" x:Family="Swiss" ss:Size="11" ss:Bold="1" ss:Color="#0F172A"/>
   <Interior ss:Color="#F1F5F9" ss:Pattern="Solid"/>
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Double" ss:Weight="3" ss:Color="#475569"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
   </Borders>
  </Style>
  <Style ss:ID="TotalValue">
   <Font ss:FontName="Segoe UI" x:Family="Swiss" ss:Size="11" ss:Bold="1" ss:Color="#0F172A"/>
   <Interior ss:Color="#F1F5F9" ss:Pattern="Solid"/>
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <NumberFormat ss:Format="#,##0"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Double" ss:Weight="3" ss:Color="#475569"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
   </Borders>
  </Style>
 </Styles>
 <Worksheet ss:Name="Stock Summary">
  <Table ss:ExpandedColumnCount="12">
   <Column ss:Width="60"/> <!-- Grade -->
   <Column ss:Width="90"/> <!-- Packing Code -->
   <Column ss:Width="150"/> <!-- Packing Description -->
   <Column ss:Width="80"/> <!-- Total MCs -->
   <Column ss:Width="90"/> <!-- Available MCs -->
   <Column ss:Width="90"/> <!-- Reserved MCs -->
   <Column ss:Width="90"/> <!-- Allocated MCs -->
   <Column ss:Width="100"/> <!-- Pending PO MCs -->
   <Column ss:Width="90"/> <!-- MCs per FCL -->
   <Column ss:Width="70"/> <!-- FCL 40ft -->
   <Column ss:Width="110"/> <!-- Oldest Stock Date -->
   <Column ss:Width="80"/> <!-- Days Aging -->

   <!-- Title Block -->
   <Row ss:Height="25">
    <Cell ss:StyleID="Title"><Data ss:Type="String">Finished Goods Stock Inventory Report</Data></Cell>
   </Row>
   <Row ss:Height="18">
    <Cell ss:StyleID="Subtitle"><Data ss:Type="String">Generated on: ${formatDisplayDateTime(new Date())} | FG Store Management</Data></Cell>
   </Row>
   <Row ss:Height="10"/> <!-- Spacer -->

   <!-- Headers -->
   <Row ss:Height="24">
    <Cell ss:StyleID="Header"><Data ss:Type="String">Grade</Data></Cell>
    <Cell ss:StyleID="Header"><Data ss:Type="String">Packing Code</Data></Cell>
    <Cell ss:StyleID="Header"><Data ss:Type="String">Packing Desc</Data></Cell>
    <Cell ss:StyleID="Header"><Data ss:Type="String">Total MCs</Data></Cell>
    <Cell ss:StyleID="Header"><Data ss:Type="String">Available MCs</Data></Cell>
    <Cell ss:StyleID="Header"><Data ss:Type="String">Reserved MCs</Data></Cell>
    <Cell ss:StyleID="Header"><Data ss:Type="String">Allocated MCs</Data></Cell>
    <Cell ss:StyleID="Header"><Data ss:Type="String">Pending PO MCs</Data></Cell>
    <Cell ss:StyleID="Header"><Data ss:Type="String">MCs/FCL</Data></Cell>
    <Cell ss:StyleID="Header"><Data ss:Type="String">FCL 40ft</Data></Cell>
    <Cell ss:StyleID="Header"><Data ss:Type="String">Oldest Stock Date</Data></Cell>
    <Cell ss:StyleID="Header"><Data ss:Type="String">Days Aging</Data></Cell>
   </Row>
`;

    let rowsXml = '';
    data.forEach((row, index) => {
        const isZebra = index % 2 === 1;
        const stringStyle = isZebra ? 'DataStringZebra' : 'DataString';
        const numberStyle = isZebra ? 'DataNumberZebra' : 'DataNumber';
        const centerStyle = isZebra ? 'DataCenterZebra' : 'DataCenter';

        rowsXml += `   <Row ss:Height="20">
    <Cell ss:StyleID="${centerStyle}"><Data ss:Type="String">${row.grade}</Data></Cell>
    <Cell ss:StyleID="${centerStyle}"><Data ss:Type="String">${row.packingCode}</Data></Cell>
    <Cell ss:StyleID="${stringStyle}"><Data ss:Type="String">${row.packingDescription}</Data></Cell>
    <Cell ss:StyleID="${numberStyle}"><Data ss:Type="Number">${row.totalMCs}</Data></Cell>
    <Cell ss:StyleID="${numberStyle}"><Data ss:Type="Number">${row.availableMCs}</Data></Cell>
    <Cell ss:StyleID="${numberStyle}"><Data ss:Type="Number">${row.reservedMCs}</Data></Cell>
    <Cell ss:StyleID="${numberStyle}"><Data ss:Type="Number">${row.allocatedMCs}</Data></Cell>
    <Cell ss:StyleID="${numberStyle}"><Data ss:Type="Number">${row.pendingPOMCs}</Data></Cell>
    <Cell ss:StyleID="${numberStyle}"><Data ss:Type="Number">${row.mcsPerFCL}</Data></Cell>
    <Cell ss:StyleID="${numberStyle}"><Data ss:Type="Number">${row.fcl40ft}</Data></Cell>
    <Cell ss:StyleID="${centerStyle}"><Data ss:Type="String">${row.oldestPackingDate ? formatDisplayDate(row.oldestPackingDate) : 'N/A'}</Data></Cell>
    <Cell ss:StyleID="${numberStyle}"><Data ss:Type="Number">${row.daysAging}</Data></Cell>
   </Row>\n`;
    });

    const totalsXml = `   <Row ss:Height="22">
    <Cell ss:StyleID="TotalLabel"><Data ss:Type="String">Total</Data></Cell>
    <Cell ss:StyleID="TotalLabel"/>
    <Cell ss:StyleID="TotalLabel"/>
    <Cell ss:StyleID="TotalValue"><Data ss:Type="Number">${totalMCs}</Data></Cell>
    <Cell ss:StyleID="TotalValue"><Data ss:Type="Number">${totalAvailable}</Data></Cell>
    <Cell ss:StyleID="TotalValue"><Data ss:Type="Number">${totalReserved}</Data></Cell>
    <Cell ss:StyleID="TotalValue"><Data ss:Type="Number">${totalAllocated}</Data></Cell>
    <Cell ss:StyleID="TotalValue"><Data ss:Type="Number">${totalPending}</Data></Cell>
    <Cell ss:StyleID="TotalValue"/>
    <Cell ss:StyleID="TotalValue"/>
    <Cell ss:StyleID="TotalValue"/>
    <Cell ss:StyleID="TotalValue"><Data ss:Type="Number">${avgDaysAging}</Data></Cell>
   </Row>\n`;

    const footerXml = `  </Table>
  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
   <PageSetup>
    <Header x:Margin="0.3"/>
    <Footer x:Margin="0.3"/>
    <PageMargins x:Bottom="0.75" x:Left="0.7" x:Right="0.7" x:Top="0.75"/>
   </PageSetup>
   <Print>
    <ValidPrinterInfo/>
    <HorizontalResolution>600</HorizontalResolution>
    <VerticalResolution>600</VerticalResolution>
   </Print>
   <Selected/>
   <Panes>
    <Pane>
     <Number>3</Number>
     <ActiveRow>1</ActiveRow>
    </Pane>
   </Panes>
   <ProtectObjects>False</ProtectObjects>
   <ProtectScenarios>False</ProtectScenarios>
  </WorksheetOptions>
 </Worksheet>
</Workbook>`;

    const xmlString = xml + rowsXml + totalsXml + footerXml;
    return Buffer.from(xmlString, 'utf-8');
}

export function generateExcelFilename(): string {
    const now = new Date();
    const dateStr = formatDisplayDate(now);
    return `FG_Stock_Dashboard_${dateStr}.xls`;
}
