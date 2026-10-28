import * as transferService from '../services/transfer.service.js';

export async function createTransfer(req, res) {
  const transfer = await transferService.createTransfer(req.validated.body);
  res.status(201).json({ success: true, data: transfer });
}
