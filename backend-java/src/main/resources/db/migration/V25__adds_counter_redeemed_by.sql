-- Ai bấm khi quầy đổi thưởng HỘ khách.
--
-- Khác hẳn `honoured_by`: cột đó ghi ai PHÁT món, cột này ghi ai TIÊU ĐIỂM. Một lần đổi hộ có thể
-- do hai người khác nhau làm hai việc đó, và khi khách khiếu nại "sao điểm của tôi mất" thì câu
-- hỏi là ai tiêu, không phải ai phát.
--
-- NULL nghĩa là khách tự đổi trong app — đó vẫn là đường đi thường gặp nhất.
ALTER TABLE loyalty_redemptions
    ADD COLUMN redeemed_by character varying(50) REFERENCES public.users (id);
