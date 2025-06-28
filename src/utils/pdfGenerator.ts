import jsPDF from 'jspdf';

interface InvoiceData {
  invoiceNumber: string;
  date: string;
  dueDate: string;
  clientName: string;
  clientEmail: string;
  clientAddress: string;
  items: Array<{
    description: string;
    quantity: number;
    rate: number;
    amount: number;
  }>;
  subtotal: number;
  tax?: number;
  total: number;
  notes?: string;
  userInfo: {
    name: string;
    company?: string;
    email: string;
  };
}

export const generateInvoicePDF = (invoiceData: InvoiceData): void => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  
  // Colors
  const primaryColor = [59, 130, 246]; // Blue
  const darkColor = [31, 41, 55]; // Dark gray
  const lightColor = [107, 114, 128]; // Light gray
  
  // Header - Company/User Info
  doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.rect(0, 0, pageWidth, 40, 'F');
  
  // Logo/Company Name
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.text('⚡ QuickBill Pro', 20, 25);
  
  // User/Company Info
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(invoiceData.userInfo.name, pageWidth - 20, 15, { align: 'right' });
  if (invoiceData.userInfo.company) {
    doc.text(invoiceData.userInfo.company, pageWidth - 20, 22, { align: 'right' });
  }
  doc.text(invoiceData.userInfo.email, pageWidth - 20, 29, { align: 'right' });
  
  // Invoice Title and Number
  doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
  doc.setFontSize(28);
  doc.setFont('helvetica', 'bold');
  doc.text('INVOICE', 20, 65);
  
  doc.setFontSize(14);
  doc.setFont('helvetica', 'normal');
  doc.text(`Invoice #: ${invoiceData.invoiceNumber}`, 20, 80);
  doc.text(`Date: ${new Date(invoiceData.date).toLocaleDateString()}`, 20, 90);
  doc.text(`Due Date: ${new Date(invoiceData.dueDate).toLocaleDateString()}`, 20, 100);
  
  // Bill To Section
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Bill To:', pageWidth - 80, 65);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const billToY = 75;
  doc.text(invoiceData.clientName, pageWidth - 80, billToY);
  doc.text(invoiceData.clientEmail, pageWidth - 80, billToY + 8);
  
  // Split address into lines
  const addressLines = invoiceData.clientAddress.split('\n');
  addressLines.forEach((line, index) => {
    doc.text(line, pageWidth - 80, billToY + 16 + (index * 8));
  });
  
  // Invoice Items Table
  const tableStartY = 130;
  const tableHeaders = ['Description', 'Qty', 'Rate', 'Amount'];
  const columnWidths = [90, 25, 30, 35];
  const columnX = [20, 110, 135, 165];
  
  // Table header
  doc.setFillColor(249, 250, 251);
  doc.rect(20, tableStartY, pageWidth - 40, 12, 'F');
  
  doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  
  tableHeaders.forEach((header, index) => {
    const align = index === 0 ? 'left' : 'right';
    const x = index === 0 ? columnX[index] : columnX[index] + columnWidths[index];
    doc.text(header, x, tableStartY + 8, { align });
  });
  
  // Table rows
  doc.setFont('helvetica', 'normal');
  let currentY = tableStartY + 20;
  
  invoiceData.items.forEach((item, index) => {
    if (currentY > pageHeight - 50) {
      doc.addPage();
      currentY = 20;
    }
    
    // Alternate row colors
    if (index % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(20, currentY - 6, pageWidth - 40, 12, 'F');
    }
    
    doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
    
    // Description (left aligned)
    doc.text(item.description.substring(0, 50), columnX[0], currentY);
    
    // Quantity (right aligned)
    doc.text(item.quantity.toString(), columnX[1] + columnWidths[1], currentY, { align: 'right' });
    
    // Rate (right aligned)
    doc.text(`$${item.rate.toFixed(2)}`, columnX[2] + columnWidths[2], currentY, { align: 'right' });
    
    // Amount (right aligned)
    doc.text(`$${item.amount.toFixed(2)}`, columnX[3] + columnWidths[3], currentY, { align: 'right' });
    
    currentY += 15;
  });
  
  // Totals section
  currentY += 10;
  const totalsX = pageWidth - 80;
  
  // Subtotal
  doc.setFont('helvetica', 'normal');
  doc.text('Subtotal:', totalsX, currentY);
  doc.text(`$${invoiceData.subtotal.toFixed(2)}`, pageWidth - 20, currentY, { align: 'right' });
  currentY += 10;
  
  // Tax (if applicable)
  if (invoiceData.tax && invoiceData.tax > 0) {
    doc.text('Tax:', totalsX, currentY);
    doc.text(`$${invoiceData.tax.toFixed(2)}`, pageWidth - 20, currentY, { align: 'right' });
    currentY += 10;
  }
  
  // Total
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Total:', totalsX, currentY);
  doc.text(`$${invoiceData.total.toFixed(2)}`, pageWidth - 20, currentY, { align: 'right' });
  
  // Notes section
  if (invoiceData.notes) {
    currentY += 30;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Notes:', 20, currentY);
    
    doc.setFont('helvetica', 'normal');
    currentY += 10;
    
    // Split notes into lines to fit width
    const noteLines = doc.splitTextToSize(invoiceData.notes, pageWidth - 40);
    noteLines.forEach((line: string) => {
      if (currentY > pageHeight - 20) {
        doc.addPage();
        currentY = 20;
      }
      doc.text(line, 20, currentY);
      currentY += 6;
    });
  }
  
  // Footer
  const footerY = pageHeight - 20;
  doc.setFontSize(8);
  doc.setTextColor(lightColor[0], lightColor[1], lightColor[2]);
  doc.text('Generated by QuickBill Pro - Professional Invoicing Made Simple', pageWidth / 2, footerY, { align: 'center' });
  
  // Save the PDF
  doc.save(`Invoice-${invoiceData.invoiceNumber}.pdf`);
};

export const previewInvoicePDF = (invoiceData: InvoiceData): string => {
  const doc = new jsPDF();
  
  // Generate the same PDF content (simplified version for preview)
  doc.setFontSize(20);
  doc.text('INVOICE', 20, 30);
  doc.setFontSize(12);
  doc.text(`Invoice #: ${invoiceData.invoiceNumber}`, 20, 50);
  doc.text(`Client: ${invoiceData.clientName}`, 20, 65);
  doc.text(`Total: $${invoiceData.total.toFixed(2)}`, 20, 80);
  
  // Return as data URL for preview
  return doc.output('dataurlstring');
};